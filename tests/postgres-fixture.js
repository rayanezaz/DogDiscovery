import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { connectionOptions } from '../server/database.js';
export async function createTestDatabase() {
  const url=new URL(process.env.TEST_DATABASE_URL || 'postgresql://localhost:5433/postgres');
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Tests must use an isolated local PostgreSQL server.');
  const name=`dog_discovery_test_${randomBytes(8).toString('hex')}`;
  const admin=new pg.Client(await connectionOptions(url.toString()));
  await admin.connect();
  try {await admin.query(`CREATE DATABASE "${name}"`);}catch(error){await admin.end();throw error;}
  url.pathname=`/${name}`;
  return {url:url.toString(),name,async cleanup(){try{await admin.query(`DROP DATABASE "${name}"`);}finally{await admin.end();}}};
}
