import postgres from 'postgres';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL manquante.'); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });
try { const rows = await sql`select current_database() as database, version() as version`; console.log('Connexion Neon OK :', rows[0].database); }
catch (e) { console.error('Connexion Neon impossible :', e.message); process.exitCode = 1; }
finally { await sql.end(); }
