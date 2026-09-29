import mongoose from 'mongoose';
import { config } from './config.js';

let connectionPromise;

export async function connectDB() {
  if (!config.mongoUri) throw new Error('MONGODB_URI is not configured');
  if (mongoose.connection.readyState === 1) return;
  mongoose.set('strictQuery', true);
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
      .then(() => console.log('[ZOTRIX] MongoDB connected'))
      .catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
  }
  await connectionPromise;
}
