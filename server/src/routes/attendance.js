import express from 'express';
import Attendance from '../models/Attendance.js';
import Worker from '../models/Worker.js';
import { allowRoles, canAccessWorker, requireAuth, workerAccessFilter } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { todayISO, eligibleWorker } from '../utils/dates.js';

const router = express.Router();
router.use(requireAuth);

function normalizeStatus(v) { return ['P','H','A'].includes(v) ? v : 'P'; }

router.get('/', async (req, res) => {
  const date = String(req.query.date || todayISO());
  const workerId = req.query.workerId;
  const filter = { date, deletedAt: null };
  if (workerId) filter.workerId = workerId;
  if (req.user.role === 'labour') filter.workerId = req.user.workerId;
  else Object.assign(filter, workerAccessFilter(req.user));
  const records = await Attendance.find(filter).populate('workerId', 'name role projectId wage status joining stopDate').sort({ createdAt: 1 });
  res.json({ date, records });
});

router.post('/bulk', allowRoles('master', 'admin'), async (req, res) => {
  const date = String(req.body?.date || todayISO());
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const workers = await Worker.find({ _id: { $in: records.map(r => r.workerId).filter(Boolean) }, deletedAt: null, ...workerAccessFilter(req.user) });
  const workerMap = new Map(workers.map(w => [String(w._id), w]));
  const results = [];
  for (const r of records) {
    const worker = workerMap.get(String(r.workerId));
    if (!worker || !eligibleWorker(worker, date)) continue;
    const status = normalizeStatus(r.status);
    const doc = await Attendance.findOneAndUpdate(
      { workerId: worker._id, date },
      { $set: { status, otHours: Math.max(0, Number(r.otHours || 0)), lateMinutes: Math.max(0, Number(r.lateMinutes || 0)), note: String(r.note || ''), updatedBy: req.user._id, deletedAt: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(doc);
  }
  await audit(req.user._id, 'bulk_attendance', 'Attendance', date, { count: results.length, date });
  res.json({ date, records: results });
});

router.patch('/:id', allowRoles('master', 'admin'), async (req, res) => {
  const doc = await Attendance.findOne({ _id: req.params.id, deletedAt: null });
  if (!doc) return res.status(404).json({ message: 'Attendance record not found' });
  const worker = await Worker.findById(doc.workerId);
  if (!worker || !canAccessWorker(req.user, worker)) return res.status(404).json({ message: 'Attendance record not found' });
  if (req.body.status) doc.status = normalizeStatus(req.body.status);
  if (req.body.otHours !== undefined) doc.otHours = Math.max(0, Number(req.body.otHours || 0));
  if (req.body.lateMinutes !== undefined) doc.lateMinutes = Math.max(0, Number(req.body.lateMinutes || 0));
  if (req.body.note !== undefined) doc.note = String(req.body.note || '');
  doc.updatedBy = req.user._id;
  await doc.save();
  await audit(req.user._id, 'update_attendance', 'Attendance', doc._id);
  res.json(doc);
});

export default router;
