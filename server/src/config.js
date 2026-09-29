import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envCandidates = [
  resolve(projectRoot, '.env.local'),
  resolve(projectRoot, '.env'),
  resolve(projectRoot, 'server', '.env.local'),
  resolve(projectRoot, 'server', '.env')
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

if (!envCandidates.some((envPath) => existsSync(envPath))) {
  dotenv.config();
}

const required = ['MONGODB_URI', 'JWT_SECRET', 'SETUP_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[ZOTRIX] Missing environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  setupKey: String(process.env.SETUP_KEY || '').trim(),
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV || 'development'
};
