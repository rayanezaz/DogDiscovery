import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../server/app.js';
import { createAuthFixture } from './supabase-fixture.js';
import { createTestDatabase } from './postgres-fixture.js';
const database = await createTestDatabase();
const auth = await createAuthFixture();
let repo, server, vite;
async function cleanup() {
  await vite?.close();
  if(server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await repo?.close();
  await database.cleanup();
  await auth.close();
}
try {
  const result = await createApp({database:database.url,uploads:'data/browser-test-uploads',seed:true,auth:{url:auth.url,key:auth.key,origin:'http://127.0.0.1:3100'},uploadStorage:'local'});
  repo=result.repo;
  server=createServer(result.app);
  vite=await createViteServer({server:{middlewareMode:true,hmr:{server}},appType:'spa'});
  result.app.use(vite.middlewares);
  server.listen(3100,'127.0.0.1');
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await cleanup();process.exit(0);});
} catch(error) { await cleanup(); throw error; }
