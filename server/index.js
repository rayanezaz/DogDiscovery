import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const { app, repo } = await createApp();
const server = createHttpServer(app);
let vite;
if (process.argv.includes('--production') || process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}',(req,res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Dog Discovery is ready at http://localhost:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {
  await vite?.close();
  server.close(async () => { await repo.close(); process.exit(0); });
  server.closeAllConnections();
});
