import app from './app.js';
import { config } from './config.js';
import { connectDB } from './db.js';

try {
  await connectDB();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[ZOTRIX] API listening on http://0.0.0.0:${config.port}`);
  });
} catch (error) {
  console.error('[ZOTRIX] Server startup failed:', error.message);
  process.exitCode = 1;
}
