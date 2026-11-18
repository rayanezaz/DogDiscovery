import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRepository } from './database.js';
import { createServices } from './services.js';
import { dogInput, text, id, choice, HttpError } from './validation.js';
import { authConfiguration, registerAuthRoutes, sessionMiddleware, requireAuth } from './auth.js';
import { seedDatabase } from './seed.js';

export async function createApp({ database = process.env.DATABASE_URL, uploads = process.env.UPLOAD_DIR || 'uploads', seed = process.env.SEED_DEMO === 'true', auth, uploadStorage = process.env.UPLOAD_STORAGE || 'supabase' } = {}) {
  const authConfig=authConfiguration(auth);
  const repo = await createRepository(database);
  try { if (seed) await seedDatabase(repo); } catch(error) { await repo.close(); throw error; }
  await mkdir(uploads, { recursive: true });
  const services = createServices(repo);
  const app = express();
  app.disable('x-powered-by');
  const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  app.use(helmet({
    contentSecurityPolicy: production ? { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'https://images.unsplash.com', ...(authConfig.url ? [new URL(authConfig.url).origin] : [])],
      connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    } } : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const allowedOrigin = authConfig.origin;
      let valid = !origin;
      if (origin) { try { valid = allowedOrigin ? origin === allowedOrigin : new URL(origin).host === req.get('host'); } catch { valid = false; } }
      if (!valid || req.get('sec-fetch-site') === 'cross-site') return next(new HttpError(403, 'Cross-site requests are not allowed.'));
    }
    next();
  });
  app.use('/api', sessionMiddleware(repo,authConfig));
  app.use('/uploads', express.static(resolve(uploads), { dotfiles: 'deny', maxAge: '7d' }));
  const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Try again in 15 minutes.' } });
  const writeLimit = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please slow down and try again shortly.' } });
  app.use('/api', (req,res,next) => ['GET','HEAD'].includes(req.method) ? next() : writeLimit(req,res,next));
  app.get('/api/health', async (req,res) => res.json({ status: 'ok' }));
  registerAuthRoutes(app,repo,authConfig,authLimit);
  app.patch('/api/profile',requireAuth,async (req,res) => {
    const name = text(req.body.name,'Name',2,80);
    const location = text(req.body.location ?? '', 'Location',0,100);
    const bio = text(req.body.bio ?? '', 'Bio',0,1000);
    const avatar = req.body.avatar || null;
    if (avatar) (await services.checkImages([avatar],req.user));
    (await repo.run('UPDATE users SET name=?,location=?,bio=?,avatar=? WHERE id=?',name,location,bio,avatar,req.user.id));
    res.json({ user: (await repo.get('SELECT id,name,email,location,bio,avatar FROM users WHERE id=?',req.user.id)) });
  });
  app.get('/api/dogs',async (req,res) => res.json({ dogs: (await services.listDogs(req.query,req.user)) }));
  app.get('/api/dogs/:id',async (req,res) => res.json({ dog: (await services.dog(id(req.params.id))) }));
  app.post('/api/dogs',requireAuth,async (req,res) => res.status(201).json({ dog: (await services.saveDog(dogInput(req.body),req.user)) }));
  app.put('/api/dogs/:id',requireAuth,async (req,res) => res.json({ dog: (await services.saveDog(dogInput(req.body),req.user,id(req.params.id))) }));
  app.delete('/api/dogs/:id',requireAuth,async (req,res) => { (await services.deleteDog(id(req.params.id),req.user)); res.json({ ok: true }); });
  app.get('/api/favorites',requireAuth,async (req,res) => res.json({ favorites: (await repo.all('SELECT dog_id FROM favorites WHERE user_id=?',req.user.id)).map(x => x.dog_id) }));
  app.put('/api/favorites/:id',requireAuth,async (req,res) => {
    const dogId = id(req.params.id); (await services.dog(dogId));
    (await repo.run('INSERT INTO favorites(user_id,dog_id) VALUES (?,?) ON CONFLICT (user_id,dog_id) DO NOTHING',req.user.id,dogId)); res.json({ ok: true });
  });
  app.delete('/api/favorites/:id',requireAuth,async (req,res) => { (await repo.run('DELETE FROM favorites WHERE user_id=? AND dog_id=?',req.user.id,id(req.params.id))); res.json({ ok: true }); });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.post('/api/images',requireAuth,upload.single('image'),async (req,res) => {
    if (!req.file) throw new HttpError(400,'Choose an image to upload.');
    let buffer;
    try { buffer = await sharp(req.file.buffer, { limitInputPixels: 25000000 }).rotate().resize(1600,1600,{ fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(); }
    catch { throw new HttpError(400,'Upload a valid photo up to 5 MB and 25 megapixels.'); }
    const imageId = randomUUID();
    let url;
    if(uploadStorage==='local') {
      url=`/uploads/${imageId}.webp`;
      await writeFile(resolve(uploads,`${imageId}.webp`),buffer);
    } else {
      const bucket=process.env.SUPABASE_STORAGE_BUCKET || 'dog-photos';
      const objectPath=`${req.authUser.id}/${imageId}.webp`;
      const {error}=await req.supabase.storage.from(bucket).upload(objectPath,buffer,{contentType:'image/webp',upsert:false});
      if(error) throw new HttpError(503,'The photo could not be saved. Please try again.');
      url=req.supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
    }
    (await repo.run('INSERT INTO images(id,owner_id,url) VALUES (?,?,?)',imageId,req.user.id,url));
    res.status(201).json({ url });
  });
  app.get('/api/adoptions',requireAuth,async (req,res) => res.json({ adoptions: (await services.applications(req.user)) }));
  app.post('/api/dogs/:id/adoptions',requireAuth,async (req,res) => res.status(201).json({ adoption: (await services.apply(id(req.params.id),req.user,text(req.body.note,'Introduction',20,2000))) }));
  app.patch('/api/adoptions/:id',requireAuth,async (req,res) => res.json({ adoption: (await services.decide(id(req.params.id),req.user,choice(req.body.status,['accepted','rejected','withdrawn'],'application status'))) }));
  app.get('/api/conversations',requireAuth,async (req,res) => res.json({ conversations: (await services.conversations(req.user)) }));
  app.post('/api/conversations',requireAuth,async (req,res) => res.status(201).json({ conversation: (await services.startConversation(id(req.body.dog_id),req.user,text(req.body.body,'Message',1,2000))) }));
  app.get('/api/conversations/:id/messages',requireAuth,async (req,res) => {
    const conversation = (await services.thread(id(req.params.id),req.user));
    res.json({ messages: (await repo.all('SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE conversation_id=? ORDER BY m.id',conversation.id)) });
  });
  app.post('/api/conversations/:id/messages',requireAuth,async (req,res) => {
    const conversation = (await services.thread(id(req.params.id),req.user));
    const body = text(req.body.body,'Message',1,2000);
    (await repo.run('INSERT INTO messages(conversation_id,sender_id,body) VALUES (?,?,?)',conversation.id,req.user.id,body));
    res.status(201).json({ ok: true });
  });
  app.use('/api',async (req,res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((err,req,res,next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one image, up to 5 MB.' });
    const status = err.status || 500;
    if (status === 500) console.error('API request failed:', err.code || err.name);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
  });
  return { app, repo };
}
