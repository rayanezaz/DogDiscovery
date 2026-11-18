import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createAuthFixture } from './supabase-fixture.js';
import { createTestDatabase } from './postgres-fixture.js';
import { createApp } from '../server/app.js';
import { createServices } from '../server/services.js';
import { ensureProfile } from '../server/auth.js';

let server, repo, base, directory, database, auth;
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'dog-discovery-test-'));
  database=await createTestDatabase();auth=await createAuthFixture();
  const app=await createApp({database:database.url,uploads:directory,seed:true,auth:{url:auth.url,key:auth.key},uploadStorage:'local'});repo=app.repo;
  server=app.app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await repo?.close();await database?.cleanup();await auth?.close();if(directory)await rm(directory,{recursive:true,force:true});});
async function request(path,{method='GET',body,cookie,headers={}}={}){
  const response=await fetch(base+path,{method,redirect:'manual',headers:{...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();
  const jar=new Map((cookie||'').split('; ').filter(Boolean).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
  const setCookies=response.headers.getSetCookie();
  for(const header of setCookies) {
    const pair=header.split(';')[0],i=pair.indexOf('='),name=pair.slice(0,i),value=pair.slice(i+1);
    if(!value || /max-age=0/i.test(header))jar.delete(name);else jar.set(name,value);
  }
  return {status:response.status,data,cookie:[...jar].map(([key,value])=>`${key}=${value}`).join('; '),setCookies,location:response.headers.get('location')};
}
async function login(email='alex@dogdiscovery.demo') {const r=await request('/api/auth/login',{method:'POST',body:{email,password:'Discover123!'}});assert.equal(r.status,200);return r.cookie;}

test('discovery searches and filters real SQL records',async()=>{
  const all=await request('/api/dogs');assert.equal(all.data.dogs.length,8);
  assert.equal((await request('/api/dogs?q=maple')).data.dogs[0].name,'Maple');
  const filtered=await request('/api/dogs?age=puppy&size=Large');assert.deepEqual(filtered.data.dogs.map(x=>x.name),['Milo']);
  assert.equal((await request('/api/dogs?q=%27%20OR%201=1--')).data.dogs.length,0);
  assert.equal((await request('/api/dogs/garbage')).status,400);
});
test('registration, protected routes, session invalidation, and cross-origin writes',async()=>{
  assert.equal((await request('/api/dogs',{method:'POST',body:{}})).status,401);
  assert.equal((await request('/api/auth/register',{method:'POST',body:{name:'Jo',email:'wrong',password:'123'}})).status,400);
  const registered=await request('/api/auth/register',{method:'POST',body:{name:'Test Adopter',email:'test@example.com',password:'long-password'}});
  assert.equal(registered.status,201);assert.ok(registered.cookie);assert.equal(registered.data.user.password_hash,undefined);
  assert.equal((await request('/api/auth/me',{cookie:registered.cookie})).data.user.name,'Test Adopter');
  assert.equal((await request('/api/auth/register',{method:'POST',body:{name:'Test Adopter',email:'test@example.com',password:'long-password'}})).status,202);
  assert.equal((await request('/api/favorites/1',{method:'PUT',cookie:registered.cookie,headers:{Origin:'https://evil.example'}})).status,403);
  await request('/api/auth/logout',{method:'POST',cookie:registered.cookie});
  assert.equal((await request('/api/auth/me',{cookie:registered.cookie})).data.user,null);
  assert.equal((await request('/api/auth/login',{method:'POST',body:{email:'test@example.com',password:'wrong'}})).status,401);
});
test('favorites persist and are private to each account',async()=>{
  const adopter=await login(),owner=await login('rescue@dogdiscovery.demo');
  await request('/api/favorites/1',{method:'PUT',cookie:adopter});
  await request('/api/favorites/1',{method:'PUT',cookie:adopter});
  assert.deepEqual((await request('/api/favorites',{cookie:adopter})).data.favorites,[1]);
  assert.deepEqual((await request('/api/favorites',{cookie:owner})).data.favorites,[]);
  assert.equal((await request('/api/dogs?saved=true',{cookie:adopter})).data.dogs.length,1);
  await request('/api/favorites/1',{method:'DELETE',cookie:adopter});
  assert.deepEqual((await request('/api/favorites',{cookie:adopter})).data.favorites,[]);
});
test('images are decoded, normalized, and checked for ownership in listings and profiles',async()=>{
  const owner=await login('rescue@dogdiscovery.demo'),adopter=await login();
  const invalid=new FormData();invalid.append('image',new Blob(['<script>alert(1)</script>'],{type:'image/png'}),'fake.png');
  assert.equal((await request('/api/images',{method:'POST',cookie:owner,body:invalid})).status,400);
  const png=await sharp({create:{width:20,height:20,channels:3,background:'#bada55'}}).png().toBuffer();
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'dog.png');
  const uploaded=await request('/api/images',{method:'POST',cookie:owner,body:form});assert.equal(uploaded.status,201);assert.match(uploaded.data.url,/\.webp$/);
  const body={name:'Test pup',breed:'Happy mix',age_months:12,size:'Medium',sex:'Male',location:'Portland, OR',description:'A very good dog who enjoys sunny afternoons.',images:[uploaded.data.url],traits:['Friendly']};
  assert.equal((await request('/api/dogs',{method:'POST',cookie:adopter,body})).status,400);
  const created=await request('/api/dogs',{method:'POST',cookie:owner,body});assert.equal(created.status,201);const id=created.data.dog.id;
  assert.equal((await request(`/api/dogs/${id}`,{method:'PUT',cookie:adopter,body})).status,403);
  assert.equal((await request(`/api/dogs/${id}`,{method:'DELETE',cookie:adopter})).status,403);
  assert.equal((await request(`/api/dogs/${id}`,{method:'PUT',cookie:owner,body:{...body,status:'paused'}})).status,200);
  assert.equal((await request('/api/dogs?q=Test%20pup')).data.dogs.length,0);
  assert.equal((await request('/api/profile',{method:'PATCH',cookie:adopter,body:{name:'Alex',avatar:uploaded.data.url}})).status,400);
  assert.equal((await request('/api/profile',{method:'PATCH',cookie:owner,body:{name:'Sunny Paws Rescue',avatar:uploaded.data.url,bio:'Updated profile',location:'Portland, OR'}})).status,200);
  assert.equal((await request(`/api/dogs/${id}`,{method:'DELETE',cookie:owner})).status,200);
  assert.equal((await request(`/api/dogs/${id}`)).status,404);
});
test('conversations are visible only to their participants and support replies',async()=>{
  const adopter=await login(),owner=await login('rescue@dogdiscovery.demo');
  const stranger=(await request('/api/auth/login',{method:'POST',body:{email:'test@example.com',password:'long-password'}})).cookie;
  const started=await request('/api/conversations',{method:'POST',cookie:adopter,body:{dog_id:2,body:'Is Archie good with other dogs?'}});assert.equal(started.status,201);const id=started.data.conversation.id;
  assert.equal((await request(`/api/conversations/${id}/messages`,{cookie:stranger})).status,404);
  assert.equal((await request(`/api/conversations/${id}/messages`,{method:'POST',cookie:stranger,body:{body:'Intrusion'}})).status,404);
  assert.equal((await request(`/api/conversations/${id}/messages`,{method:'POST',cookie:owner,body:{body:'Yes, Archie loves other dogs!'}})).status,201);
  const messages=await request(`/api/conversations/${id}/messages`,{cookie:adopter});assert.equal(messages.data.messages.length,2);
  assert.equal((await request('/api/conversations',{cookie:owner})).data.conversations.length,1);
});
test('acceptance updates the dog and competing applications atomically, retaining adoption history',async()=>{
  const adopter=await login(),owner=await login('rescue@dogdiscovery.demo');
  const stranger=(await request('/api/auth/login',{method:'POST',body:{email:'test@example.com',password:'long-password'}})).cookie;
  const body={note:'I have a loving home with a garden and lots of time for walks.'};
  assert.equal((await request('/api/dogs/1/adoptions',{method:'POST',cookie:owner,body})).status,400);
  const first=await request('/api/dogs/1/adoptions',{method:'POST',cookie:adopter,body});assert.equal(first.status,201);
  const second=await request('/api/dogs/1/adoptions',{method:'POST',cookie:stranger,body});assert.equal(second.status,201);
  assert.equal((await request('/api/dogs/1/adoptions',{method:'POST',cookie:adopter,body})).status,409);
  assert.equal((await request(`/api/adoptions/${first.data.adoption.id}`,{method:'PATCH',cookie:adopter,body:{status:'accepted'}})).status,403);
  assert.equal((await request(`/api/adoptions/${first.data.adoption.id}`,{method:'PATCH',cookie:owner,body:{status:'accepted'}})).status,200);
  assert.equal((await request('/api/dogs/1')).data.dog.status,'adopted');
  assert.equal((await request('/api/dogs?q=Maple')).data.dogs.length,0);
  assert.equal((await request('/api/adoptions',{cookie:stranger})).data.adoptions[0].status,'rejected');
  assert.equal((await request(`/api/adoptions/${second.data.adoption.id}`,{method:'PATCH',cookie:owner,body:{status:'accepted'}})).status,409);
  assert.equal((await request('/api/dogs/1',{method:'DELETE',cookie:owner})).status,409);
  assert.equal((await repo.get("SELECT COUNT(*) AS n FROM adoptions WHERE dog_id=1 AND status='accepted'")).n,1);
  await assert.rejects(repo.run('INSERT INTO favorites(user_id,dog_id) VALUES (?,?)',999999,1),{code:'23503'});
});

test('concurrent adoption decisions allow one winner and roll back failed transactions',async()=>{
  const services = createServices(repo);
  const owner = {id:1}, adopter = {id:2};
  const other = await repo.get('SELECT id FROM users WHERE email=?','test@example.com');
  const first = await services.apply(3,adopter,'A loving home with plenty of room for adventures.');
  const second = await services.apply(3,other,'Another loving home with plenty of time for walks.');
  const outcomes = await Promise.allSettled([
    services.decide(first.id,owner,'accepted'),services.decide(second.id,owner,'accepted'),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.find(x=>x.status==='rejected').reason.status,409);
  assert.equal((await repo.get("SELECT COUNT(*) AS n FROM adoptions WHERE dog_id=3 AND status='accepted'")).n,1);
  assert.equal((await services.dog(3)).status,'adopted');
  await assert.rejects(repo.transaction(async()=>{
    await repo.run('UPDATE users SET bio=? WHERE id=?','Should roll back',2);
    throw new Error('Deliberate rollback');
  }),/Deliberate rollback/);
  assert.notEqual((await repo.get('SELECT bio FROM users WHERE id=?',2)).bio,'Should roll back');
});

test('OAuth uses PKCE cookies, verifies the returned user, and rejects code replay',async()=>{
  const config=await request('/api/auth/config');
  assert.deepEqual(config.data.providers,['google','github']);
  assert.equal((await request('/api/auth/oauth/untrusted',{method:'POST'})).status,400);
  const started=await request('/api/auth/oauth/google',{method:'POST'});
  assert.equal(started.status,200);
  const authorization=new URL(started.data.url);
  assert.equal(authorization.searchParams.get('code_challenge_method'),'s256');
  assert.ok(started.setCookies.some(x=>/HttpOnly/i.test(x) && /SameSite=Lax/i.test(x)));
  const response=await fetch(started.data.url,{redirect:'manual'});
  const callback=new URL(response.headers.get('location'));
  const result=await request(callback.pathname+callback.search,{cookie:started.cookie});
  assert.equal(result.location,'/?auth_success=1#/profile');
  const me=await request('/api/auth/me',{cookie:result.cookie});
  assert.equal(me.data.user.email,'alex@dogdiscovery.demo');
  const replay=await request(callback.pathname+callback.search,{cookie:started.cookie});
  assert.match(replay.location,/auth_error=expired/);
  const cancelled=await request('/api/auth/callback?error=access_denied&next=https://evil.example');
  assert.equal(cancelled.location,'/?auth_error=cancelled#/');
});

test('OAuth callback cannot exchange a code without its browser verifier',async()=>{
  const started=await request('/api/auth/oauth/github',{method:'POST'});
  const response=await fetch(started.data.url,{redirect:'manual'});
  const callback=new URL(response.headers.get('location'));
  const result=await request(callback.pathname+callback.search);
  assert.match(result.location,/auth_error=expired/);
  assert.equal((await request('/api/auth/me',{cookie:result.cookie})).data.user,null);
});

test('email confirmation is required and unverified identities cannot claim legacy profiles',async()=>{
  const registered=await request('/api/auth/register',{method:'POST',body:{name:'Confirm Test',email:'confirm-test@example.com',password:'long-password'}});
  assert.equal(registered.status,202);assert.equal(registered.data.confirmationRequired,true);assert.equal(registered.data.user,null);
  assert.equal((await request('/api/auth/me',{cookie:registered.cookie})).data.user,null);
  assert.equal((await request('/api/auth/login',{method:'POST',body:{email:'confirm-test@example.com',password:'long-password'}})).status,403);
  await assert.rejects(ensureProfile(repo,{id:'00000000-0000-0000-0000-000000000001',email:'alex@dogdiscovery.demo',user_metadata:{email_verified:true}}),{status:403});
  assert.equal((await repo.get("SELECT relrowsecurity FROM pg_class WHERE oid='dog_discovery.users'::regclass")).relrowsecurity,true);
});

test('Supabase Storage receives normalized photos under the verified user UUID',async()=>{
  const secondary=await createApp({database:database.url,seed:false,uploads:directory,auth:{url:auth.url,key:auth.key},uploadStorage:'supabase'});
  const listener=secondary.app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
  try {
    const cookie=await login('rescue@dogdiscovery.demo');
    const png=await sharp({create:{width:24,height:24,channels:3,background:'#aabbcc'}}).png().toBuffer();
    const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'photo.png');
    const response=await fetch(`http://127.0.0.1:${listener.address().port}/api/images`,{method:'POST',headers:{Cookie:cookie},body:form});
    const result=await response.json();assert.equal(response.status,201);
    const identity=auth.users.get('rescue@dogdiscovery.demo').user;
    assert.match(result.url,new RegExp(`/storage/v1/object/public/dog-photos/${identity.id}/`));
    assert.equal(auth.uploads.at(-1).userId,identity.id);assert.ok(auth.uploads.at(-1).size>0);
  } finally {await new Promise(resolve=>listener.close(resolve));await secondary.repo.close();}
});
