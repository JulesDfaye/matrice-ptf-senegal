import { Hono } from 'hono';

// Branchez getUser sur la session déjà vérifiée par votre API Hono existante.
// Il doit retourner { id, username } ou null. Ne lisez jamais un user_id depuis le body pour authentifier.
const DEFAULT_PERMISSIONS = {
  dashboard_read: true,
  matrix_read: true, matrix_write: true,
  partners_read: true, partners_write: true,
  activities_read: true, activities_write: true,
  indicators_read: true, indicators_write: true,
  exports: true
};
const ADMIN = new Set(['*']);

async function identity(c, getUser) {
  const user = await getUser(c);
  if (!user?.id) return null;
  const row = await c.env.DB.prepare(
    'SELECT role, permissions_json, active FROM user_roles WHERE user_id = ?'
  ).bind(String(user.id)).first();
  if (!row || !row.active) return { ...user, role: 'utilisateur', permissions: {} };
  let permissions = {};
  try { permissions = JSON.parse(row.permissions_json || '{}'); } catch { permissions = {}; }
  return { ...user, role: row.role, permissions };
}

function allowed(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'utilisateur' && user.permissions?.[permission] === true;
}

export function createAccessRouter({ getUser }) {
  if (typeof getUser !== 'function') throw new Error('Fournir getUser(c) connecté à votre système de session.');
  const app = new Hono();
  const requireLogin = async (c, next) => {
    const user = await identity(c, getUser);
    if (!user) return c.json({ error: 'Authentification requise.' }, 401);
    c.set('accessUser', user);
    return next();
  };
  const requireAdmin = async (c, next) => {
    if (c.get('accessUser')?.role !== 'admin') return c.json({ error: 'Réservé à l’administrateur.' }, 403);
    return next();
  };
  app.use('*', requireLogin);
  app.get('/me', c => {
    const u = c.get('accessUser');
    return c.json({ id: u.id, username: u.username, role: u.role, permissions: u.role === 'admin' ? { all: true } : u.permissions });
  });
  app.get('/users', requireAdmin, async c => {
    // La table users est celle de l'authentification déjà installée.
    const { results = [] } = await c.env.DB.prepare(
      `SELECT u.id, u.username, COALESCE(r.role,'utilisateur') AS role,
       COALESCE(r.active,1) AS active, COALESCE(r.permissions_json,'{}') AS permissions_json
       FROM users u LEFT JOIN user_roles r ON r.user_id = u.id ORDER BY u.username`
    ).all();
    return c.json(results.map(x => ({ ...x, permissions: JSON.parse(x.permissions_json || '{}'), permissions_json: undefined })));
  });
  app.put('/users/:id/role', requireAdmin, async c => {
    const id = c.req.param('id');
    if (id === String(c.get('accessUser').id)) return c.json({ error: 'Ne modifiez pas votre propre rôle depuis cet écran.' }, 400);
    const body = await c.req.json();
    const role = body.role;
    if (!['admin','utilisateur'].includes(role)) return c.json({ error: 'Rôle invalide.' }, 400);
    const permissions = role === 'admin' ? {} : sanitizePermissions(body.permissions);
    const active = body.active === false ? 0 : 1;
    await c.env.DB.prepare(`INSERT INTO user_roles(user_id,role,permissions_json,active,updated_at)
      VALUES(?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET
      role=excluded.role, permissions_json=excluded.permissions_json, active=excluded.active, updated_at=datetime('now')`)
      .bind(id, role, JSON.stringify(permissions), active).run();
    await audit(c, 'user.role.update', 'user', id, { role, active });
    return c.json({ ok: true });
  });
  app.post('/publications', requireAdmin, async c => {
    const b = await c.req.json();
    const types = ['presentation','partner','activity','action_plan','achievement','statistic'];
    if (!types.includes(b.content_type) || !String(b.title || '').trim()) return c.json({ error: 'Type ou titre invalide.' }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO public_publications
      (id,content_type,title,summary,payload_json,is_published,published_by,published_at,updated_at)
      VALUES(?,?,?,?,?,1,?,datetime('now'),datetime('now'))`)
      .bind(id,b.content_type,String(b.title).slice(0,180),String(b.summary || '').slice(0,1500),JSON.stringify(sanitizePublicPayload(b.payload)),String(c.get('accessUser').id)).run();
    await audit(c, 'public.publish', b.content_type, id, {});
    return c.json({ ok: true, id }, 201);
  });
  app.patch('/publications/:id', requireAdmin, async c => {
    const b = await c.req.json();
    const published = b.is_published === true ? 1 : 0;
    await c.env.DB.prepare(`UPDATE public_publications SET is_published=?, updated_at=datetime('now'),
      published_by=?, published_at=CASE WHEN ?=1 THEN datetime('now') ELSE published_at END WHERE id=?`)
      .bind(published,String(c.get('accessUser').id),published,c.req.param('id')).run();
    await audit(c, published ? 'public.publish' : 'public.unpublish', 'publication', c.req.param('id'), {});
    return c.json({ ok: true });
  });
  return app;
}

export function can(user, permission) { return allowed(user, permission); }
function sanitizePermissions(input = {}) {
  const keys = Object.keys(DEFAULT_PERMISSIONS);
  return Object.fromEntries(keys.map(k => [k, input[k] === true]));
}
function sanitizePublicPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  // Liste blanche : aucun email, téléphone, contact privé, note d'évaluation ou donnée nominative.
  const allowedKeys = ['name','category','country','domain','axis','zone','activity','startDate','endDate','status','budgetPublic','deliverables','beneficiaries','region','urban','rural','value','unit','year','description','imageUrl'];
  return Object.fromEntries(Object.entries(input).filter(([k,v]) => allowedKeys.includes(k) && ['string','number','boolean'].includes(typeof v)).map(([k,v]) => [k, typeof v === 'string' ? v.slice(0,1200) : v]));
}
async function audit(c, action, target_type, target_id, details) {
  await c.env.DB.prepare(`INSERT INTO access_audit_log(actor_user_id,action,target_type,target_id,details_json)
    VALUES(?,?,?,?,?)`).bind(String(c.get('accessUser')?.id || ''),action,target_type,target_id,JSON.stringify(details || {})).run();
}
