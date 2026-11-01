import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

const PASSWORD_ITERATIONS = 310_000;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 850_000;
const MAX_RECORDS = 500;
const COLLECTIONS = new Set(['partners', 'activites', 'partenairesFiches', 'indicateurs', 'settings', 'multi', 'bi', 'hors']);
const COLLECTION_ALIASES = { 'partner-profiles': 'partenairesFiches', activities: 'activites', indicators: 'indicateurs' };
function resolveCollection(name) { return COLLECTION_ALIASES[name] || name; }
const ARRAY_COLLECTIONS = new Set(['partners', 'activites', 'partenairesFiches', 'multi', 'bi', 'hors']);
const encoder = new TextEncoder();

const app = new Hono();
app.use('*', secureHeaders());
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  await next();
});

// Les mutations sont limitées à la même origine. Aucun CORS public n'est activé.
app.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'Origine non autorisée.' }, 403);
  }
  await next();
});

function jsonError(c, message, status = 400) { return c.json({ ok: false, error: message }, status); }
function hexToBytes(hex) { return Uint8Array.from(hex.match(/.{1,2}/g) || [], (b) => parseInt(b, 16)); }
function bytesToHex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
function bytesToBase64Url(bytes) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}
async function hashPassword(password, saltHex, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}
function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a)); const right = encoder.encode(String(b));
  let diff = left.length ^ right.length; const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
function randomHex(byteCount = 16) {
  const bytes = new Uint8Array(byteCount); crypto.getRandomValues(bytes); return bytesToHex(bytes);
}
function readCookie(request, cookieName) {
  const header = request.headers.get('Cookie') || '';
  for (const item of header.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === cookieName) return rest.join('=');
  }
  return '';
}
function cookieName(request) { return new URL(request.url).protocol === 'https:' ? '__Host-matrice_session' : 'matrice_session'; }
function setSessionCookie(c, token, maxAge) {
  const secure = new URL(c.req.url).protocol === 'https:';
  const name = secure ? '__Host-matrice_session' : 'matrice_session';
  c.header('Set-Cookie', `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
function clearSessionCookie(c) { setSessionCookie(c, '', 0); }
function safeUser(row) {
  return {
    id: row.id,
    username: row.username,
    mustChangePassword: Boolean(row.must_change_password),
    profile: {
      firstName: row.first_name || '', lastName: row.last_name || '', ministry: row.ministry || '',
      department: row.department || '', position: row.position || '', phone: row.phone || '', email: row.email || ''
    }
  };
}
async function getRequestIpHash(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return sha256Hex(ip);
}
async function writeAudit(db, userId, action, ipHash, details = {}) {
  await db.prepare('INSERT INTO audit_log (user_id, action, ip_hash, details) VALUES (?, ?, ?, ?)')
    .bind(userId || null, action, ipHash || null, JSON.stringify(details)).run();
}

async function requireAuth(c, next) {
  const token = readCookie(c.req.raw, cookieName(c.req.raw));
  if (!token) return jsonError(c, 'Authentification requise.', 401);
  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.first_name, u.last_name, u.ministry, u.department, u.position, u.phone, u.email, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')
  `).bind(tokenHash).first();
  if (!row) { clearSessionCookie(c); return jsonError(c, 'Session expirée. Veuillez vous reconnecter.', 401); }
  c.set('user', row);
  await next();
}
async function requirePasswordUpdated(c, next) {
  if (Boolean(c.get('user')?.must_change_password)) return jsonError(c, 'Changez votre mot de passe temporaire avant de continuer.', 403);
  await next();
}

app.get('/api/health', (c) => c.json({ ok: true, service: 'matrice-ptf-senegal-api', timestamp: new Date().toISOString() }));

app.post('/api/auth/login', async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return jsonError(c, 'Corps JSON invalide.'); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password || username.length > 80 || password.length > 200) return jsonError(c, 'Nom d’utilisateur ou mot de passe incorrect.', 401);

  const ipHash = await getRequestIpHash(c.req.raw);
  const attempts = await c.env.DB.prepare('SELECT failed_attempts, window_started_at, locked_until FROM login_attempts WHERE ip_hash = ?').bind(ipHash).first();
  if (attempts?.locked_until && new Date(attempts.locked_until + 'Z').getTime() > Date.now()) {
    return jsonError(c, 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  const candidateHash = user ? await hashPassword(password, user.password_salt, user.password_iterations) : await hashPassword(password, '00000000000000000000000000000000');
  const valid = Boolean(user && constantTimeEqual(candidateHash, user.password_hash));
  if (!valid) {
    const now = Date.now();
    const inWindow = attempts && now - new Date(attempts.window_started_at + 'Z').getTime() < 15 * 60 * 1000;
    const count = inWindow ? Number(attempts.failed_attempts) + 1 : 1;
    const windowStart = inWindow ? attempts.window_started_at : new Date().toISOString().slice(0, 19).replace('T', ' ');
    const lockUntil = count >= 5 ? new Date(now + 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') : null;
    await c.env.DB.prepare(`INSERT INTO login_attempts (ip_hash, failed_attempts, window_started_at, locked_until)
      VALUES (?, ?, ?, ?) ON CONFLICT(ip_hash) DO UPDATE SET failed_attempts=excluded.failed_attempts,
      window_started_at=excluded.window_started_at, locked_until=excluded.locked_until`).bind(ipHash, count, windowStart, lockUntil).run();
    await writeAudit(c.env.DB, user?.id || null, 'login_failed', ipHash, { username });
    return jsonError(c, 'Nom d’utilisateur ou mot de passe incorrect.', 401);
  }

  await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')').run();
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ipHash).run();
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString().slice(0, 19).replace('T', ' ');
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run();
  await c.env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').bind(user.id).run();
  await writeAudit(c.env.DB, user.id, 'login_success', ipHash);
  setSessionCookie(c, token, SESSION_DURATION_MS / 1000);
  return c.json({ ok: true, user: safeUser(user) });
});

app.get('/api/auth/me', requireAuth, (c) => c.json({ ok: true, user: safeUser(c.get('user')) }));
app.post('/api/auth/logout', requireAuth, async (c) => {
  const token = readCookie(c.req.raw, cookieName(c.req.raw));
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  await writeAudit(c.env.DB, c.get('user').id, 'logout', await getRequestIpHash(c.req.raw));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.put('/api/profile', requireAuth, requirePasswordUpdated, async (c) => {
  let body; try { body = await c.req.json(); } catch { return jsonError(c, 'Corps JSON invalide.'); }
  const username = String(body.username || '').trim();
  if (!username || username.length > 80) return jsonError(c, 'Le nom d’utilisateur est obligatoire (80 caractères maximum).');
  const clean = {
    firstName: String(body.firstName || '').trim().slice(0, 100), lastName: String(body.lastName || '').trim().slice(0, 100),
    ministry: String(body.ministry || '').trim().slice(0, 180), department: String(body.department || '').trim().slice(0, 180),
    position: String(body.position || '').trim().slice(0, 180), phone: String(body.phone || '').trim().slice(0, 50),
    email: String(body.email || '').trim().slice(0, 180)
  };
  try {
    await c.env.DB.prepare(`UPDATE users SET username=?, first_name=?, last_name=?, ministry=?, department=?, position=?, phone=?, email=?, updated_at=datetime('now') WHERE id=?`)
      .bind(username, clean.firstName, clean.lastName, clean.ministry, clean.department, clean.position, clean.phone, clean.email, c.get('user').id).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return jsonError(c, 'Ce nom d’utilisateur est déjà utilisé.', 409);
    throw error;
  }
  await writeAudit(c.env.DB, c.get('user').id, 'profile_updated', await getRequestIpHash(c.req.raw));
  const refreshed = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(c.get('user').id).first();
  return c.json({ ok: true, user: safeUser(refreshed) });
});

app.post('/api/auth/change-password', requireAuth, async (c) => {
  let body; try { body = await c.req.json(); } catch { return jsonError(c, 'Corps JSON invalide.'); }
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 10 || newPassword.length > 200) return jsonError(c, 'Le nouveau mot de passe doit contenir au moins 10 caractères.');
  const user = await c.env.DB.prepare('SELECT id, password_hash, password_salt, password_iterations FROM users WHERE id=?').bind(c.get('user').id).first();
  const currentHash = await hashPassword(currentPassword, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(currentHash, user.password_hash)) return jsonError(c, 'Le mot de passe actuel est incorrect.', 401);
  const salt = randomHex(16); const hash = await hashPassword(newPassword, salt, PASSWORD_ITERATIONS);
  await c.env.DB.prepare(`UPDATE users SET password_hash=?, password_salt=?, password_iterations=?, must_change_password=0, updated_at=datetime('now') WHERE id=?`)
    .bind(hash, salt, PASSWORD_ITERATIONS, user.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
  await writeAudit(c.env.DB, user.id, 'password_changed', await getRequestIpHash(c.req.raw));
  clearSessionCookie(c);
  return c.json({ ok: true, message: 'Mot de passe modifié. Reconnectez-vous.' });
});

async function readState(db, userId) {
  const result = await db.prepare('SELECT collection, record_id, payload FROM platform_records WHERE user_id=? ORDER BY collection, record_id').bind(userId).all();
  const state = { partners: [], multi: [], bi: [], hors: [], activites: [], partenairesFiches: [], indicateurs: {}, settings: {} };
  for (const row of result.results || []) {
    let payload; try { payload = JSON.parse(row.payload); } catch { continue; }
    if (ARRAY_COLLECTIONS.has(row.collection)) state[row.collection].push(payload);
    else if (row.collection === 'indicateurs') state.indicateurs = payload;
    else if (row.collection === 'settings') state.settings = payload;
  }
  return state;
}
function flattenState(state) {
  const records = [];
  for (const collection of ARRAY_COLLECTIONS) {
    const items = Array.isArray(state[collection]) ? state[collection] : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id ?? crypto.randomUUID());
      records.push({ collection, id, payload: JSON.stringify({ ...item, id: item.id ?? id }) });
    }
  }
  for (const collection of ['indicateurs', 'settings']) {
    const item = state[collection];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const clean = { ...item };
      if (collection === 'settings') { delete clean.password; delete clean.currentPassword; delete clean.newPassword; }
      records.push({ collection, id: 'main', payload: JSON.stringify(clean) });
    }
  }
  return records;
}

app.get('/api/state', requireAuth, requirePasswordUpdated, async (c) => {
  const state = await readState(c.env.DB, c.get('user').id);
  const hasData = Boolean((state.partners.length + state.activites.length + state.partenairesFiches.length + state.multi.length + state.bi.length + state.hors.length) || Object.keys(state.indicateurs).length || Object.keys(state.settings).length);
  return c.json({ ok: true, state: hasData ? state : null });
});

app.put('/api/state', requireAuth, requirePasswordUpdated, async (c) => {
  const raw = await c.req.text();
  if (encoder.encode(raw).length > MAX_STATE_BYTES) return jsonError(c, 'Sauvegarde trop volumineuse (limite 850 Ko).', 413);
  let state; try { state = JSON.parse(raw); } catch { return jsonError(c, 'État JSON invalide.'); }
  if (!state || typeof state !== 'object' || !Array.isArray(state.partners)) return jsonError(c, 'Structure des données invalide.');
  const records = flattenState(state);
  if (records.length > MAX_RECORDS) return jsonError(c, `La sauvegarde dépasse la limite de ${MAX_RECORDS} enregistrements.`, 413);
  const userId = c.get('user').id;
  const statements = [c.env.DB.prepare('DELETE FROM platform_records WHERE user_id=?').bind(userId)];
  for (const record of records) {
    if (record.payload.length > 250_000) return jsonError(c, 'Un enregistrement dépasse la taille autorisée.', 413);
    statements.push(c.env.DB.prepare(`INSERT INTO platform_records (user_id, collection, record_id, payload, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))`).bind(userId, record.collection, record.id, record.payload));
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true, records: records.length, updatedAt: new Date().toISOString() });
});

// Endpoints REST génériques pour les collections. Ils utilisent les mêmes enregistrements D1 que /api/state.
app.get('/api/collections/:collection', requireAuth, requirePasswordUpdated, async (c) => {
  const collection = resolveCollection(c.req.param('collection'));
  if (!COLLECTIONS.has(collection)) return jsonError(c, 'Collection inconnue.', 404);
  if (collection === 'settings' || collection === 'indicateurs') {
    const row = await c.env.DB.prepare('SELECT payload FROM platform_records WHERE user_id=? AND collection=? AND record_id=\'main\'').bind(c.get('user').id, collection).first();
    return c.json({ ok: true, item: row ? JSON.parse(row.payload) : {} });
  }
  const rows = await c.env.DB.prepare('SELECT record_id, payload FROM platform_records WHERE user_id=? AND collection=? ORDER BY updated_at DESC').bind(c.get('user').id, collection).all();
  return c.json({ ok: true, items: (rows.results || []).map((row) => JSON.parse(row.payload)) });
});
app.put('/api/collections/:collection', requireAuth, requirePasswordUpdated, async (c) => {
  const collection = resolveCollection(c.req.param('collection'));
  if (!['settings', 'indicateurs'].includes(collection)) return jsonError(c, 'Utilisez POST pour ajouter un élément à cette collection.', 405);
  let item; try { item = await c.req.json(); } catch { return jsonError(c, 'Corps JSON invalide.'); }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return jsonError(c, 'Objet invalide.');
  const clean = { ...item };
  if (collection === 'settings') { delete clean.password; delete clean.currentPassword; delete clean.newPassword; }
  await c.env.DB.prepare(`INSERT INTO platform_records (user_id,collection,record_id,payload,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,collection,record_id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now')`)
    .bind(c.get('user').id, collection, 'main', JSON.stringify(clean)).run();
  return c.json({ ok: true, item: clean });
});

app.post('/api/collections/:collection', requireAuth, requirePasswordUpdated, async (c) => {
  const collection = resolveCollection(c.req.param('collection'));
  if (!ARRAY_COLLECTIONS.has(collection)) return jsonError(c, 'Cette collection se modifie via PUT.', 405);
  let item; try { item = await c.req.json(); } catch { return jsonError(c, 'Corps JSON invalide.'); }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return jsonError(c, 'Enregistrement invalide.');
  const id = String(item.id ?? crypto.randomUUID()); const payload = JSON.stringify({ ...item, id: item.id ?? id });
  await c.env.DB.prepare(`INSERT INTO platform_records (user_id,collection,record_id,payload,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,collection,record_id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now')`)
    .bind(c.get('user').id, collection, id, payload).run();
  return c.json({ ok: true, item: JSON.parse(payload) }, 201);
});
app.put('/api/collections/:collection/:id', requireAuth, requirePasswordUpdated, async (c) => {
  const collection = resolveCollection(c.req.param('collection')); const id = c.req.param('id');
  if (!COLLECTIONS.has(collection)) return jsonError(c, 'Collection inconnue.', 404);
  let item; try { item = await c.req.json(); } catch { return jsonError(c, 'Corps JSON invalide.'); }
  const recordId = collection === 'settings' || collection === 'indicateurs' ? 'main' : id;
  const clean = { ...item, ...(recordId === 'main' ? {} : { id: item.id ?? recordId }) };
  if (collection === 'settings') { delete clean.password; delete clean.currentPassword; delete clean.newPassword; }
  await c.env.DB.prepare(`INSERT INTO platform_records (user_id,collection,record_id,payload,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,collection,record_id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now')`)
    .bind(c.get('user').id, collection, recordId, JSON.stringify(clean)).run();
  return c.json({ ok: true, item: clean });
});
app.delete('/api/collections/:collection/:id', requireAuth, requirePasswordUpdated, async (c) => {
  const collection = resolveCollection(c.req.param('collection')); const id = c.req.param('id');
  if (!ARRAY_COLLECTIONS.has(collection)) return jsonError(c, 'Suppression non autorisée pour cette collection.', 405);
  const result = await c.env.DB.prepare('DELETE FROM platform_records WHERE user_id=? AND collection=? AND record_id=?').bind(c.get('user').id, collection, id).run();
  return c.json({ ok: true, deleted: result.meta.changes > 0 });
});

app.all('/api/*', (c) => c.json({ ok: false, error: 'Route API introuvable.' }, 404));
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  console.error('Erreur Worker API', error);
  return c.json({ ok: false, error: 'Une erreur interne est survenue.' }, 500);
});

export default app;
