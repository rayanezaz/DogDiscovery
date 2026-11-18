import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../server/database.js';
import { createTestDatabase } from './postgres-fixture.js';
import { importRecords,importColumns } from '../scripts/import-mysql.js';
import { ensureProfile } from '../server/auth.js';

const snapshot=()=>({
  ...Object.fromEntries(Object.keys(importColumns).map(table=>[table,[]])),
  users:[{id:42,name:'Existing Person',email:'legacy@example.com',location:'Portland, OR',bio:'Preserve this profile',avatar:null,created_at:'2026-01-01 12:00:00'}],
  dogs:[{id:87,owner_id:42,name:'Preserved Pup',breed:'Terrier mix',age_months:18,size:'Small',sex:'Female',location:'Portland, OR',description:'A dog whose owner and history must survive migration.',traits:'["Friendly"]',status:'available',created_at:'2026-01-02 12:00:00'}],
  dog_images:[{dog_id:87,url:'https://images.unsplash.com/example',position:0}],
  favorites:[{user_id:42,dog_id:87}],
});

test('MySQL import preserves IDs, resets sequences, refuses overwrite, and links only verified identities',async()=>{
  const database=await createTestDatabase();let repo;
  try {
    repo=await createRepository(database.url);
    const counts=await importRecords(repo,snapshot());assert.equal(counts.dogs,1);
    const linked=await ensureProfile(repo,{id:'10000000-0000-0000-0000-000000000001',email:'legacy@example.com',email_confirmed_at:new Date().toISOString(),user_metadata:{name:'Changed name'}});
    assert.equal(linked.id,42);assert.equal(linked.bio,'Preserve this profile');assert.equal(linked.name,'Existing Person');
    const next=await repo.run('INSERT INTO users(name,email) VALUES (?,?)','Next Person','next@example.com');assert.ok(next.insertId>42);
    await assert.rejects(importRecords(repo,snapshot()),/empty PostgreSQL target/);
    assert.equal((await repo.get('SELECT COUNT(*) AS n FROM dogs')).n,1);
    const columns=await repo.all("SELECT column_name FROM information_schema.columns WHERE table_schema='dog_discovery' AND table_name='users'");
    assert.ok(!columns.some(x=>x.column_name==='password_hash'));
    await assert.rejects(ensureProfile(repo,{id:'20000000-0000-0000-0000-000000000002',email:'legacy@example.com',email_confirmed_at:new Date().toISOString()}),{status:409});
  } finally {await repo?.close();await database.cleanup();}
});

test('failed imports roll back all target records',async()=>{
  const database=await createTestDatabase();let repo;
  try {
    repo=await createRepository(database.url);const broken=snapshot();broken.favorites[0].dog_id=999;
    await assert.rejects(importRecords(repo,broken),{code:'23503'});
    assert.equal((await repo.get('SELECT COUNT(*) AS n FROM users')).n,0);
    assert.equal((await repo.get('SELECT COUNT(*) AS n FROM dogs')).n,0);
  } finally {await repo?.close();await database.cleanup();}
});
