import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Worker from '../models/Worker.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { comparePassword, hashPassword, safeUser, signToken } from '../utils/auth.js';
import { audit } from '../utils/audit.js';
import { config } from '../config.js';

const router = express.Router();

function accessIds(values) {
  return Array.isArray(values) ? [...new Set(values.map(String).filter(mongoose.isValidObjectId).map(value => new mongoose.Types.ObjectId(value)))] : [];
}

router.get('/setup-status', async (_req, res) => {
  res.json({ setupAvailable: !(await User.exists({ role: 'master' })) });
});

router.post('/bootstrap', async (req, res) => {
  try {
    const { setupKey, name, loginId, password } = req.body || {};
    const submittedKey = String(setupKey || '').trim();
    if (!config.setupKey || submittedKey !== config.setupKey) return res.status(403).json({ message: 'Invalid setup key' });
    if (await User.exists({ role: 'master' })) return res.status(409).json({ message: 'Master account already exists. Use login instead.' });
    const normalizedId = String(loginId || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalizedId || normalizedId.length < 3) return res.status(400).json({ message: 'Master User ID must be at least 3 characters' });
    if (String(password || '').length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const user = await User.create({
      name: String(name || 'Master Owner').trim(),
      loginId: normalizedId,
      passwordHash: await hashPassword(password),
      role: 'master',
      jobRole: 'Master Owner',
      initials: normalizedId.slice(0, 2),
      active: true
    });
    const token = signToken(user);
    return res.status(201).json({ token, user: safeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to create master account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const loginId = String(req.body?.loginId || '').trim().toUpperCase();
    const password = String(req.body?.password || '');
    if (!loginId || !password) return res.status(400).json({ message: 'User ID and password are required' });
    const user = await User.findOne({ loginId }).select('+passwordHash');
    if (!user || !user.active || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid User ID or Password' });
    }
    const token = signToken(user);
    const worker = user.workerId ? await Worker.findById(user.workerId) : null;
    return res.json({ token, user: safeUser(user), worker });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const worker = req.user.workerId ? await Worker.findById(req.user.workerId) : null;
  res.json({ user: safeUser(req.user), worker });
});

router.patch('/me', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (b.photoUrl !== undefined && String(b.photoUrl).length > 2800000) return res.status(413).json({ message: 'Profile photo must be smaller than 2 MB' });
  for (const f of ['name','mobile','email','jobRole','photoUrl']) {
    if (b[f] !== undefined) req.user[f] = String(b[f] || '').trim();
  }
  if (req.user.role === 'labour' && req.user.workerId && b.photoUrl !== undefined) {
    await Worker.findByIdAndUpdate(req.user.workerId, { photoUrl: req.user.photoUrl });
  }
  if (b.name !== undefined) req.user.initials = req.user.name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  await req.user.save();
  await audit(req.user._id, 'update_profile', 'User', req.user._id, { fields: Object.keys(b) });
  res.json({ user: safeUser(req.user) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  req.user.passwordHash = await hashPassword(password);
  await req.user.save();
  await audit(req.user._id, 'change_password', 'User', req.user._id);
  res.json({ message: 'Password changed successfully' });
});

router.get('/users', requireAuth, allowRoles('master'), async (_req, res) => {
  const users = await User.find({ role: { $in: ['admin', 'labour'] } }).sort({ role: 1, name: 1 });
  res.json(users.map(safeUser));
});

router.post('/users', requireAuth, allowRoles('master'), async (req, res) => {
  try {
    const body = req.body || {};
    const role = body.role === 'labour' ? 'labour' : 'admin';
    const loginId = String(body.loginId || '').trim().toUpperCase().replace(/\s+/g, '');
    const password = String(body.password || '');
    if (!body.name || !loginId || password.length < 8) return res.status(400).json({ message: 'Name, User ID and an 8+ character password are required' });
    if (await User.exists({ loginId })) return res.status(409).json({ message: 'User ID already exists' });
    const initials = String(body.name).split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    const user = await User.create({
      name: String(body.name).trim(), loginId, passwordHash: await hashPassword(password), role,
      mobile: String(body.mobile || '').trim(), email: String(body.email || '').trim().toLowerCase(),
      jobRole: String(body.jobRole || (role === 'labour' ? 'Labour' : 'Site Admin')).trim(),
      accountingCategories: role === 'admin' && Array.isArray(body.accountingCategories) ? [...new Set(body.accountingCategories.map(String))] : ['*'],
      accessControlEnabled: role === 'admin',
      allProjectAccess: role === 'admin' && body.allProjectAccess === true,
      projectAccess: role === 'admin' ? accessIds(body.projectAccess) : [],
      allWorkerAccess: role === 'admin' && body.allWorkerAccess === true,
      workerAccess: role === 'admin' ? accessIds(body.workerAccess) : [],
      unassignedExpenseAccess: role === 'admin' && body.unassignedExpenseAccess === true,
      initials, active: true, createdBy: req.user._id
    });
    if (role === 'labour') {
      return res.status(201).json({ user: safeUser(user), needsWorkerLink: true });
    }
    await audit(req.user._id, 'create_user', 'User', user._id, { role });
    return res.status(201).json({ user: safeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to create user' });
  }
});

router.patch('/users/:id', requireAuth, allowRoles('master'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'master') return res.status(404).json({ message: 'User not found' });
    const body = req.body || {};
    if (body.loginId) {
      const loginId = String(body.loginId).trim().toUpperCase().replace(/\s+/g, '');
      const conflict = await User.findOne({ loginId, _id: { $ne: user._id } });
      if (conflict) return res.status(409).json({ message: 'User ID already exists' });
      user.loginId = loginId;
    }
    if (body.name !== undefined) user.name = String(body.name).trim();
    if (body.mobile !== undefined) user.mobile = String(body.mobile).trim();
    if (body.email !== undefined) user.email = String(body.email).trim().toLowerCase();
    if (body.jobRole !== undefined) user.jobRole = String(body.jobRole).trim();
    if (Array.isArray(body.accountingCategories)) user.accountingCategories = [...new Set(body.accountingCategories.map(String))];
    if (user.role === 'admin') {
      if (body.accessControlEnabled !== undefined) user.accessControlEnabled = body.accessControlEnabled === true;
      if (body.allProjectAccess !== undefined) user.allProjectAccess = body.allProjectAccess === true;
      if (Array.isArray(body.projectAccess)) user.projectAccess = accessIds(body.projectAccess);
      if (body.allWorkerAccess !== undefined) user.allWorkerAccess = body.allWorkerAccess === true;
      if (Array.isArray(body.workerAccess)) user.workerAccess = accessIds(body.workerAccess);
      if (body.unassignedExpenseAccess !== undefined) user.unassignedExpenseAccess = body.unassignedExpenseAccess === true;
    }
    if (body.active !== undefined) user.active = !!body.active;
    if (body.password) user.passwordHash = await hashPassword(String(body.password));
    user.initials = user.name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    await user.save();
    await audit(req.user._id, 'update_user', 'User', user._id, { fields: Object.keys(body) });
    res.json({ user: safeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to update user' });
  }
});

router.delete('/users/:id', requireAuth, allowRoles('master'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role === 'master') return res.status(404).json({ message: 'User not found' });
  user.active = false;
  await user.save();
  await audit(req.user._id, 'disable_user', 'User', user._id);
  res.json({ message: 'User disabled' });
});

export default router;
