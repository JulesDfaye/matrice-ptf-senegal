import app from './index.js';
import { createDatabase } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
      if (Array.isArray(value)) value.forEach(v => headers.append(key, v));
      else if (value !== undefined) headers.set(key, String(value));
    }
    let body;
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) body = JSON.stringify(req.body);
      else if (Buffer.isBuffer(req.body)) body = req.body;
      else {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        if (chunks.length) body = Buffer.concat(chunks);
      }
    }
    const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body, duplex: 'half' });
    const response = await app.fetch(request, { DB: createDatabase() });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const payload = Buffer.from(await response.arrayBuffer());
    res.end(payload);
  } catch (error) {
    console.error('Vercel API error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Erreur serveur. Vérifiez DATABASE_URL et les migrations Neon.' }));
  }
}
