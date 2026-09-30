import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import workerRoutes from './routes/workers.js';
import attendanceRoutes from './routes/attendance.js';
import expenseRoutes from './routes/expenses.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import migrationRoutes from './routes/migration.js';
import personalNoteRoutes from './routes/personalNotes.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.clientUrls.includes('*') || config.clientUrls.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((req, res, next) => {
  if ((typeof req.body === 'string' || Buffer.isBuffer(req.body)) && req.is('application/json')) {
    try {
      req.body = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body);
    } catch {
      return res.status(400).json({ message: 'Invalid JSON body' });
    }
  }
  next();
});
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/bootstrap', authLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'zotrix-api', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/personal-notes', personalNoteRoutes);

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  console.error('[ZOTRIX] API error:', error);
  if (error.message === 'Origin not allowed by CORS') return res.status(403).json({ message: 'CORS origin not allowed' });
  res.status(error.status || 500).json({ message: error.message || 'Server error' });
});

export default app;
