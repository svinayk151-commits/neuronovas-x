const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in server/.env or the hosting environment.');
  }

  if (!pool) {
    const connection = new URL(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: connection.hostname.endsWith('.supabase.co')
        ? { rejectUnauthorized: true }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    pool.on('error', error => {
      console.error('[Database] Unexpected idle client error:', error);
    });
  }

  return pool;
}

function prepareQuery(sql) {
  let index = 0;
  let inString = false;
  let converted = '';

  for (let i = 0; i < sql.length; i += 1) {
    const character = sql[i];
    if (character === "'" && sql[i + 1] === "'" && inString) {
      converted += "''";
      i += 1;
    } else if (character === "'") {
      inString = !inString;
      converted += character;
    } else if (character === '?' && !inString) {
      index += 1;
      converted += `$${index}`;
    } else {
      converted += character;
    }
  }

  return converted
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bLIKE\b/gi, 'ILIKE')
    .replace(/\bMIN\s*\(/gi, 'LEAST(');
}

function clientFor(client) {
  return {
    prepare(sql) {
      const query = prepareQuery(sql);
      return {
        async get(...params) {
          const result = await client.query(query, params);
          return result.rows[0];
        },
        async all(...params) {
          const result = await client.query(query, params);
          return result.rows;
        },
        async run(...params) {
          const insertQuery = /^\s*INSERT\b/i.test(query) && !/\bRETURNING\b/i.test(query)
            ? `${query.trimEnd().replace(/;$/, '')} RETURNING id`
            : query;
          const result = await client.query(insertQuery, params);
          return {
            changes: result.rowCount,
            lastInsertRowid: result.rows[0]?.id
          };
        }
      };
    }
  };
}

function getDb() {
  return clientFor(getPool());
}

async function initializeDatabase() {
  await getPool().query(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(clientFor(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { getDb, initializeDatabase, withTransaction, closeDatabase };
