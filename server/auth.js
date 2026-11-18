import { createServerClient } from '@supabase/ssr';
import { parseCookie, stringifySetCookie } from 'cookie';
import { credentials, HttpError } from './validation.js';

export function authConfiguration(overrides = {}) {
  const config = {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    origin: process.env.APP_ORIGIN || 'http://localhost:3000',
    providers: (process.env.OAUTH_PROVIDERS || 'google,github').split(',').map(x=>x.trim()).filter(Boolean),
    ...overrides,
  };
  config.providers = config.providers.filter(x=>['google','github'].includes(x));
  const origin = new URL(config.origin);
  if(origin.pathname !== '/' || origin.search || origin.hash) throw new Error('APP_ORIGIN must be an origin without a path, query, or hash.');
  if(origin.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) throw new Error('APP_ORIGIN must use HTTPS outside local development.');
  config.origin=origin.origin;
  return config;
}

function requestClient(req,res,config) {
  const jar = parseCookie(req.headers.cookie || '');
  return createServerClient(config.url,config.key,{
    cookieOptions: {name:'dd-supabase-session',path:'/',httpOnly:true,sameSite:'lax',secure:config.origin.startsWith('https:')},
    cookies: {
      getAll:()=>Object.entries(jar).map(([name,value])=>({name,value})),
      setAll(cookies,headers={}) {
        for(const {name,value,options} of cookies) {
          jar[name]=value;
          res.append('Set-Cookie',stringifySetCookie({name,value,...options,httpOnly:true,sameSite:'lax',secure:config.origin.startsWith('https:'),path:'/'}));
        }
        for(const [name,value] of Object.entries(headers)) res.set(name,value);
      },
    },
  });
}

export async function ensureProfile(repo, identity) {
  // Supabase's verified response is the authority. Never link legacy records from
  // an unverified email or from editable user_metadata alone.
  if(!identity?.id || !identity.email || !identity.email_confirmed_at)
    throw new HttpError(403,'Confirm your email address before signing in.');
  const email=identity.email.toLowerCase();
  return repo.transaction(async()=>{
    await repo.get('SELECT pg_advisory_xact_lock(hashtext(?))',email);
    let user=await repo.get('SELECT id,name,email,location,bio,avatar,auth_user_id FROM users WHERE auth_user_id=?',identity.id);
    if(user) return user;
    user=await repo.get('SELECT id,name,email,location,bio,avatar,auth_user_id FROM users WHERE email=? FOR UPDATE',email);
    if(user?.auth_user_id && user.auth_user_id !== identity.id) throw new HttpError(409,'This email is already connected to another sign-in identity.');
    if(user) {
      await repo.run('UPDATE users SET auth_user_id=? WHERE id=?',identity.id,user.id);
      return {...user,auth_user_id:identity.id};
    }
    const metadata=identity.user_metadata || {};
    const proposed=metadata.name || metadata.full_name || email.split('@')[0];
    const name=(typeof proposed==='string' ? proposed.trim() : 'Dog person').slice(0,80) || 'Dog person';
    const result=await repo.run('INSERT INTO users(auth_user_id,name,email) VALUES (?,?,?)',identity.id,name,email);
    return repo.get('SELECT id,name,email,location,bio,avatar,auth_user_id FROM users WHERE id=?',result.insertId);
  });
}

export function sessionMiddleware(repo,config) {
  return async (req,res,next)=>{
    if(!config.url || !config.key) return next();
    req.supabase=requestClient(req,res,config);
    const jar=parseCookie(req.headers.cookie || '');
    if(Object.keys(jar).some(name=>name.startsWith('dd-supabase-session') && !name.includes('code-verifier'))) {
      const {data,error}=await req.supabase.auth.getUser();
      if(error && (error.status >= 500 || error.name==='AuthRetryableFetchError')) throw new HttpError(503,'Sign-in is temporarily unavailable. Please try again.');
      if(!error && data.user) {
        req.authUser=data.user;
        req.user=await ensureProfile(repo,data.user);
      }
    }
    next();
  };
}
export function requireAuth(req,res,next) {
  if(!req.user) return next(new HttpError(401,'Sign in to continue.'));
  next();
}
function configured(req) {
  if(!req.supabase) throw new HttpError(503,'Sign-in is not configured yet. Please try again later.');
  return req.supabase;
}
function authError(error) {
  if(error.status===429) return new HttpError(429,'Too many sign-in attempts. Please try again shortly.');
  if(error.code==='email_not_confirmed') return new HttpError(403,'Check your inbox and confirm your email before signing in.');
  if(error.code==='weak_password') return new HttpError(400,'Choose a stronger password.');
  if(error.status>=500) return new HttpError(503,'Sign-in is temporarily unavailable. Please try again.');
  return new HttpError(400,'We couldn’t complete sign-in. Check your details and try again.');
}
export function registerAuthRoutes(app,repo,config,authLimit) {
  app.get('/api/auth/config',(req,res)=>res.json({configured:Boolean(config.url && config.key),providers:config.providers}));
  app.get('/api/auth/me',(req,res)=>res.json({user:req.user || null}));
  app.post('/api/auth/register',authLimit,async(req,res)=>{
    const input=credentials(req.body,true);
    const {data,error}=await configured(req).auth.signUp({email:input.email,password:input.password,options:{data:{name:input.name},emailRedirectTo:`${config.origin}/api/auth/callback`}});
    if(error) throw authError(error);
    if(!data.session) return res.status(202).json({user:null,confirmationRequired:true,message:'Check your email to confirm your account, then return here to sign in.'});
    const user=await ensureProfile(repo,data.user);
    res.status(201).json({user});
  });
  app.post('/api/auth/login',authLimit,async(req,res)=>{
    const input=credentials(req.body);
    const {data,error}=await configured(req).auth.signInWithPassword(input);
    if(error) {
      if(error.code==='invalid_credentials') throw new HttpError(401,'The email or password is incorrect.');
      throw authError(error);
    }
    res.json({user:await ensureProfile(repo,data.user)});
  });
  app.post('/api/auth/logout',async(req,res)=>{
    const {error}=await configured(req).auth.signOut({scope:'local'});
    if(error) throw authError(error);
    res.json({ok:true});
  });
  app.post('/api/auth/oauth/:provider',authLimit,async(req,res)=>{
    const provider=req.params.provider;
    if(!config.providers.includes(provider)) throw new HttpError(400,'That sign-in provider is not enabled.');
    const {data,error}=await configured(req).auth.signInWithOAuth({provider,options:{redirectTo:`${config.origin}/api/auth/callback`,skipBrowserRedirect:true,...(provider==='google'?{queryParams:{prompt:'select_account'}}:{})}});
    if(error || !data.url) throw new HttpError(503,'This sign-in provider is temporarily unavailable.');
    res.json({url:data.url});
  });
  app.get('/api/auth/callback',authLimit,async(req,res)=>{
    const code=typeof req.query.code==='string' ? req.query.code : '';
    // All return URLs are fixed and same-origin. Provider messages are not echoed.
    if(req.query.error || !code || code.length>4096) return res.redirect('/?auth_error=cancelled#/');
    try {
      const flowId=typeof req.query.sb_flow_id==='string' ? req.query.sb_flow_id : undefined;
      const {error}=await configured(req).auth.exchangeCodeForSession(code,flowId ? {flowId} : undefined);
      if(error) return res.redirect('/?auth_error=expired#/');
      const {data,error:userError}=await req.supabase.auth.getUser();
      if(userError || !data.user) return res.redirect('/?auth_error=failed#/');
      await ensureProfile(repo,data.user);
      return res.redirect('/?auth_success=1#/profile');
    } catch {return res.redirect('/?auth_error=failed#/');}
  });
}
