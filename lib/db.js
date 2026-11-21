import postgres from 'postgres';

let client;
function getClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est absente des variables d’environnement Vercel.');
  if (!client) client = postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: 'require'
  });
  return client;
}

function toPostgres(sql) {
  let index = 0;
  return sql
    .replace(/username\s*=\s*\?/gi, 'LOWER(username) = LOWER(?)')
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
    .replace(/datetime\('now'\)/gi, "NOW()::text")
    .replace(/\?/g, () => '$' + (++index));
}

class Statement {
  constructor(query) { this.query = query; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() {
    const q = toPostgres(this.query); const rows = await getClient().unsafe(q, this.params);
    return rows[0] || null;
  }
  async all() {
    const q = toPostgres(this.query); const rows = await getClient().unsafe(q, this.params);
    return { results: rows };
  }
  async run() {
    const q = toPostgres(this.query); const result = await getClient().unsafe(q, this.params);
    return { success: true, meta: { changes: result.count || 0 } };
  }
}
toPostgres.index = 0;

export function createDatabase() {
  return {
    prepare(query) { toPostgres.index = 0; return new Statement(query); },
    async batch(statements) {
      return getClient().begin(async tx => {
        const results = [];
        for (const statement of statements) {
          const q = toPostgres(statement.query);
          const result = await tx.unsafe(q, statement.params);
          results.push({ success: true, meta: { changes: result.count || 0 } });
        }
        return results;
      });
    }
  };
}
