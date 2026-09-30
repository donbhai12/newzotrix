import express from 'express';
import { randomBytes } from 'node:crypto';
import Worker from '../models/Worker.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Attendance from '../models/Attendance.js';
import Expense from '../models/Expense.js';
import { accountingCategoryFilter, allowRoles, canAccessWorker, projectAccessFilter, requireAuth, workerAccessFilter } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { todayISO, eligibleWorker } from '../utils/dates.js';
import { hashPassword } from '../utils/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  let filter = { deletedAt: null };
  if (req.user.role === 'labour') filter = { _id: req.user.workerId, deletedAt: null };
  else filter = { deletedAt: null, ...workerAccessFilter(req.user) };
  const workers = await Worker.find(filter).sort({ createdAt: -1 });
  res.json(workers);
});

router.get('/:id/ledger', async (req, res) => {
  if (req.user.role === 'labour' && String(req.user.workerId) !== String(req.params.id)) return res.status(403).json({ message: 'Not allowed' });
  const worker = await Worker.findOne({ _id: req.params.id, deletedAt: null, ...workerAccessFilter(req.user) });
  if (!worker) return res.status(404).json({ message: 'Worker not found' });
  const [attendance, payments] = await Promise.all([
    Attendance.find({ workerId: worker._id, deletedAt: null }).sort({ date: -1 }).limit(500),
    Expense.find({ workerId: worker._id, deletedAt: null, ...accountingCategoryFilter(req.user) }).sort({ date: -1 }).limit(500).populate('userId', 'name loginId')
  ]);
  res.json({ worker, attendance, payments });
});

router.post('/', allowRoles('master', 'admin'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ message: 'Labour name is required' });
    const project = b.projectId ? await Project.findOne({ _id: b.projectId, deletedAt: null, ...projectAccessFilter(req.user) }) : null;
    if (b.projectId && !project) return res.status(400).json({ message: 'Selected project not found or not assigned to this admin' });
    if (req.user.role === 'admin' && req.user.accessControlEnabled === true && !b.projectId) return res.status(403).json({ message: 'Select an assigned project for this labour record' });
    const worker = await Worker.create({
      name: String(b.name).trim(), fatherName: String(b.fatherName || '').trim(), role: String(b.role || 'Labour').trim(), mobile: String(b.mobile || '').trim(),
      wage: Math.max(0, Number(b.wage || 0)), otRate: Math.max(0, Number(b.otRate || 0)), joining: String(b.joining || todayISO()),
      projectId: project?._id || null, status: b.status === 'Stopped' ? 'Stopped' : 'Active',
      stopDate: b.status === 'Stopped' ? String(b.stopDate || todayISO()) : '', stopReason: b.status === 'Stopped' ? String(b.stopReason || '') : '',
      bankName: String(b.bankName || ''), accountHolder: String(b.accountHolder || ''), accountNo: String(b.accountNo || ''),
      ifsc: String(b.ifsc || ''), upiId: String(b.upiId || ''), photoUrl: String(b.photoUrl || '')
    });

    let credentials = null;
    if (b.createLogin && req.user.role === 'master') {
      let loginId;
      do { loginId = `ZOTRIX-LAB-${randomBytes(4).toString('hex').toUpperCase()}`; } while (await User.exists({ loginId }));
      const password = randomBytes(12).toString('base64url');
      const user = await User.create({ name: worker.name, loginId, passwordHash: await hashPassword(password), role: 'labour', fatherName: worker.fatherName, mobile: worker.mobile, jobRole: worker.role, initials: worker.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(), photoUrl: worker.photoUrl, workerId: worker._id, createdBy: req.user._id });
      credentials = { name: worker.name, loginId, password };
      worker._user = String(user._id);
      await worker.save();
    }
    await audit(req.user._id, 'create_worker', 'Worker', worker._id, { name: worker.name });
    res.status(201).json({ ...worker.toObject(), credentials });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to create labour record' });
  }
});

router.patch('/:id', allowRoles('master', 'admin'), async (req, res) => {
  const worker = await Worker.findOne({ _id: req.params.id, deletedAt: null, ...workerAccessFilter(req.user) });
  if (!worker) return res.status(404).json({ message: 'Labour not found' });
  const b = req.body || {};
  if (b.projectId !== undefined) {
    const project = b.projectId ? await Project.findOne({ _id: b.projectId, deletedAt: null, ...projectAccessFilter(req.user) }) : null;
    if (b.projectId && !project) return res.status(403).json({ message: 'Selected project is not assigned to this admin' });
    const nextWorker = { _id: worker._id, projectId: project?._id || null };
    if (!canAccessWorker(req.user, nextWorker)) return res.status(403).json({ message: 'This labour record would leave your assigned access' });
    worker.projectId = project?._id || null;
  }
  for (const f of ['name','fatherName','role','mobile','joining','stopDate','stopReason','bankName','accountHolder','accountNo','ifsc','upiId','photoUrl']) if (b[f] !== undefined) worker[f] = String(b[f]);
  if (b.wage !== undefined) worker.wage = Math.max(0, Number(b.wage || 0));
  if (b.otRate !== undefined) worker.otRate = Math.max(0, Number(b.otRate || 0));
  if (b.status && ['Active','Stopped'].includes(b.status)) {
    worker.status = b.status;
    if (b.status === 'Active') { worker.stopDate = ''; worker.stopReason = ''; }
    else if (!worker.stopDate) worker.stopDate = todayISO();
  }
  await worker.save();
  if (b.fatherName !== undefined) await User.updateOne({ workerId: worker._id }, { $set: { fatherName: worker.fatherName } });

  if (b.loginId || b.password || b.active !== undefined) {
    if (req.user.role !== 'master') return res.status(403).json({ message: 'Only Master can manage labour login accounts' });
    let account = await User.findOne({ workerId: worker._id });
    if (!account && b.loginId && b.password) {
      const loginId = String(b.loginId).trim().toUpperCase().replace(/\s+/g, '');
      if (await User.exists({ loginId })) return res.status(409).json({ message: 'Labour Login ID already exists' });
      account = await User.create({ name: worker.name, loginId, passwordHash: await hashPassword(String(b.password)), role: 'labour', fatherName: worker.fatherName, mobile: worker.mobile, jobRole: worker.role, initials: worker.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(), workerId: worker._id, createdBy: req.user._id });
    } else if (account) {
      if (b.loginId) {
        const loginId = String(b.loginId).trim().toUpperCase().replace(/\s+/g, '');
        const conflict = await User.findOne({ loginId, _id: { $ne: account._id } });
        if (conflict) return res.status(409).json({ message: 'Labour Login ID already exists' });
        account.loginId = loginId;
      }
      if (b.password) account.passwordHash = await hashPassword(String(b.password));
      if (b.active !== undefined) account.active = !!b.active;
      account.name = worker.name; account.fatherName = worker.fatherName; account.mobile = worker.mobile; account.jobRole = worker.role;
      await account.save();
    }
  }

  if (b.createLogin && req.user.role === 'master') {
    let account = await User.findOne({ workerId: worker._id });
    let loginId = account?.loginId;
    if (!account) {
      do { loginId = `ZOTRIX-LAB-${randomBytes(4).toString('hex').toUpperCase()}`; } while (await User.exists({ loginId }));
    }
    const password = randomBytes(12).toString('base64url');
    if (account) {
      account.passwordHash = await hashPassword(password);
      account.active = true;
      account.name = worker.name;
      account.fatherName = worker.fatherName;
      account.mobile = worker.mobile;
      account.jobRole = worker.role;
      account.photoUrl = worker.photoUrl;
      await account.save();
    } else {
      account = await User.create({ name: worker.name, loginId, passwordHash: await hashPassword(password), role: 'labour', fatherName: worker.fatherName, mobile: worker.mobile, jobRole: worker.role, initials: worker.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(), photoUrl: worker.photoUrl, workerId: worker._id, createdBy: req.user._id });
    }
    req.credentials = { name: worker.name, loginId: account.loginId, password };
  }

  await audit(req.user._id, 'update_worker', 'Worker', worker._id, { fields: Object.keys(b) });
  res.json({ ...worker.toObject(), credentials: req.credentials || null });
});

router.delete('/:id', allowRoles('master'), async (req, res) => {
  const worker = await Worker.findById(req.params.id);
  if (!worker || worker.deletedAt) return res.status(404).json({ message: 'Labour not found' });
  worker.status = 'Deleted'; worker.deletedAt = new Date(); await worker.save();
  await User.updateMany({ workerId: worker._id }, { $set: { active: false } });
  await audit(req.user._id, 'delete_worker', 'Worker', worker._id);
  res.json({ message: 'Labour deleted; historical payments/attendance are retained' });
});

export default router;
