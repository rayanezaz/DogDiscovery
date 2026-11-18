// Test-only Auth HTTP contract fixture. Production never imports this module.
// Requests go through the real Supabase SDK and cookie/PKCE implementation.
import express from 'express';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
export async function createAuthFixture() {
  const app=express();app.use((req,res,next)=>{res.set('X-Supabase-Api-Version','2024-01-01');next();});app.use(express.json());
  const users=new Map(),tokens=new Map(),refreshTokens=new Map(),codes=new Map(),uploads=[];
  function user(email,name,confirmed=true) {
    const value={id:randomUUID(),email,email_confirmed_at:confirmed?new Date().toISOString():null,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),user_metadata:{name},app_metadata:{provider:'email',providers:['email']}};
    users.set(email,{user:value,password:'Discover123!'});return value;
  }
  user('alex@dogdiscovery.demo','Alex Morgan');user('rescue@dogdiscovery.demo','Sunny Paws Rescue');
  function session(identity) {
    const payload=Buffer.from(JSON.stringify({sub:identity.id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),aud:'authenticated',session_id:randomUUID()})).toString('base64url');
    const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${payload}.${randomBytes(32).toString('base64url')}`;
    const refresh=randomUUID();tokens.set(token,identity);refreshTokens.set(refresh,identity);
    return {access_token:token,refresh_token:refresh,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:identity};
  }
  const bad=(res,status,code,message)=>res.status(status).json({code,msg:message,message});
  const identity=req=>tokens.get(req.headers.authorization?.replace(/^Bearer /,''));
  app.post('/auth/v1/signup',(req,res)=>{
    const {email,password,data}=req.body;
    if(users.has(email)) return res.json({id:randomUUID(),email,identities:[]});
    const confirmed=!email.startsWith('confirm-');
    const value=user(email,data?.name||'Test person',confirmed);users.get(email).password=password;
    res.json(confirmed?session(value):value);
  });
  app.post('/auth/v1/token',(req,res)=>{
    if(req.query.grant_type==='password') {
      const found=users.get(req.body.email);
      if(!found||found.password!==req.body.password)return bad(res,400,'invalid_credentials','Invalid credentials');
      if(!found.user.email_confirmed_at)return bad(res,400,'email_not_confirmed','Email not confirmed');
      return res.json(session(found.user));
    }
    if(req.query.grant_type==='refresh_token') {
      const found=refreshTokens.get(req.body.refresh_token);refreshTokens.delete(req.body.refresh_token);
      if(!found)return bad(res,400,'refresh_token_not_found','Invalid refresh token');
      return res.json(session(found));
    }
    if(req.query.grant_type==='pkce') {
      const record=codes.get(req.body.auth_code);codes.delete(req.body.auth_code);
      const challenge=createHash('sha256').update(req.body.code_verifier||'').digest('base64url');
      if(!record||record.challenge!==challenge)return bad(res,400,'bad_code_verifier','Invalid OAuth verifier');
      return res.json(session(record.identity));
    }
    bad(res,400,'unsupported_grant_type','Unknown grant');
  });
  app.get('/auth/v1/user',(req,res)=>{const found=identity(req);found?res.json(found):bad(res,401,'bad_jwt','Invalid token');});
  app.post('/auth/v1/logout',(req,res)=>{
    const token=req.headers.authorization?.replace(/^Bearer /,'');const found=tokens.get(token);tokens.delete(token);
    for(const [key,value] of refreshTokens)if(value.id===found?.id)refreshTokens.delete(key);
    res.sendStatus(204);
  });
  app.get('/auth/v1/authorize',(req,res)=>{
    const email=req.query.provider==='github'?'rescue@dogdiscovery.demo':'alex@dogdiscovery.demo';
    const code=randomUUID();codes.set(code,{identity:users.get(email).user,challenge:req.query.code_challenge});
    const redirect=new URL(req.query.redirect_to);redirect.searchParams.set('code',code);res.redirect(redirect.toString());
  });
  app.post('/storage/v1/object/:bucket/{*path}',express.raw({type:'*/*',limit:'6mb'}),(req,res)=>{
    const found=identity(req);const path=Array.isArray(req.params.path)?req.params.path.join('/'):req.params.path;
    if(!found||!path.startsWith(found.id+'/'))return bad(res,403,'forbidden','Wrong owner');
    uploads.push({bucket:req.params.bucket,path,size:req.body.length,userId:found.id});res.json({Key:`${req.params.bucket}/${path}`,Id:randomUUID()});
  });
  const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  return {url:`http://127.0.0.1:${server.address().port}`,key:'test-publishable-key',users,tokens,refreshTokens,codes,uploads,session,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
