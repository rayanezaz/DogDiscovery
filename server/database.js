import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import { readFile } from 'node:fs/promises';

export async function connectionOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Set DATABASE_URL to the Supabase PostgreSQL connection string. See SUPABASE_SETUP.md.');
  const url = new URL(connectionString);
  if (url.hostname.endsWith('pooler.supabase.com') && url.port === '6543') {
    throw new Error('Use the Supabase Session pooler on port 5432. This app requires session settings that the transaction pooler on port 6543 does not preserve.');
  }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  // Keep certificate verification enabled. URL SSL options must not override it.
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  const ca = process.env.PGSSLROOTCERT ? await readFile(process.env.PGSSLROOTCERT,'utf8') : undefined;
  return {
    connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10000,
    ssl: local ? false : { rejectUnauthorized: true, ...(ca ? {ca} : {}) },
    types: { getTypeParser(oid, format) {
      if (oid === 1114) return value => value; // UTC SQL timestamps, consistent with the existing UI.
      if (oid === 20) return value => { const n=Number(value); if(!Number.isSafeInteger(n)) throw new Error('Database integer exceeds JavaScript precision.'); return n; };
      return pg.types.getTypeParser(oid,format);
    } },
  };
}

// Repository statements use positional '?' parameters. Values are always sent
// separately to pg; quoted SQL literals and identifiers are left unchanged.
export function parameters(sql) {
  let index=0, quote=null, output='';
  for(let i=0;i<sql.length;i++) {
    const char=sql[i];
    if(quote) {
      output+=char;
      if(char===quote) { if(sql[i+1]===quote) output+=sql[++i]; else quote=null; }
    } else if(char==="'" || char==='"') {quote=char;output+=char;}
    else output+=char==='?' ? `$${++index}` : char;
  }
  return output;
}

export async function createRepository(connectionString, { initialize = true } = {}) {
  const pool = new pg.Pool(await connectionOptions(connectionString));
  const context = new AsyncLocalStorage();
  pool.on('error', error => console.error('Idle PostgreSQL connection failed:', error.code || error.name));
  const connect = async () => {
    const client = await pool.connect();
    try { await client.query("SET search_path TO dog_discovery, pg_catalog; SET TIME ZONE 'UTC'"); return client; }
    catch(error) {client.release();throw error;}
  };
  const query = async (sql, values) => {
    const current=context.getStore();
    if(current) return current.query(parameters(sql),values);
    const client=await connect();
    try {return await client.query(parameters(sql),values);} finally {client.release();}
  };
  try {
    if(initialize) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(148832101)');
        await client.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
        await client.query('COMMIT');
      } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    }
  } catch(error) {await pool.end();throw error;}
  return {
    async get(sql,...values) {return (await query(sql,values)).rows[0];},
    async all(sql,...values) {return (await query(sql,values)).rows;},
    async run(sql,...values) {
      if(/^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) sql+=' RETURNING *';
      const result=await query(sql,values);
      return {insertId:result.rows[0]?.id,affectedRows:result.rowCount};
    },
    async transaction(fn) {
      if(context.getStore()) return fn();
      const client=await connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        const result=await context.run(client,fn);
        await client.query('COMMIT');return result;
      } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    },
    close:()=>pool.end(),
  };
}
