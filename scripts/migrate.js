import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createRepository, connectionOptions } from '../server/database.js';
const repo=await createRepository();
await repo.close();
console.log('Dog Discovery PostgreSQL schema is ready.');
if(process.argv.includes('--storage')) {
  const client=new pg.Client(await connectionOptions());await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(new URL('../supabase/storage.sql',import.meta.url),'utf8'));
    await client.query('COMMIT');console.log('Supabase photo bucket and upload policies are ready.');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {await client.end();}
}
