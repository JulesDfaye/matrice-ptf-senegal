import { Hono } from 'hono';

// Route publique sans session : ne lit QUE les lignes explicitement publiées par l'admin.
export const publicShowcase = new Hono();
publicShowcase.get('/showcase', async c => {
  const { results = [] } = await c.env.DB.prepare(`SELECT id,content_type,title,summary,payload_json,published_at
    FROM public_publications WHERE is_published=1 ORDER BY published_at DESC`).all();
  const items = results.map(r => ({ ...r, payload: safeJson(r.payload_json), payload_json: undefined }));
  const count = type => items.filter(x => x.content_type === type).length;
  return c.json({
    title: 'Matrice Partenaire et PTF Sénégal',
    updatedAt: new Date().toISOString(),
    stats: { partenaires: count('partner'), activites: count('activity'), plansAction: count('action_plan'), realisations: count('achievement') },
    items
  });
});
function safeJson(v) { try { return JSON.parse(v || '{}'); } catch { return {}; } }
