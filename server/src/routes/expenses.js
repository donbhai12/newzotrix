import express from 'express';
import Expense from '../models/Expense.js';
import Project from '../models/Project.js';
import Worker from '../models/Worker.js';
import { allowRoles, accountingCategoryFilter, canAccessAccountingCategory, canAccessExpense, canAccessProject, canAccessWorker, expenseAccessFilter, requireAuth } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const projectId = String(req.query.projectId || '');
  const userId = String(req.query.userId || '');
  const category = String(req.query.category || '');
  const type = String(req.query.type || '');
  const filter = { deletedAt: null, ...accountingCategoryFilter(req.user) };
  const access = expenseAccessFilter(req.user);
  const clauses = Object.keys(access).length ? [access] : [];
  if (category && category !== 'all' && !canAccessAccountingCategory(req.user, category)) return res.json([]);
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (projectId && projectId !== 'all') filter.projectId = projectId;
  if (userId && userId !== 'all') filter.userId = userId;
  if (category && category !== 'all') filter.category = category;
  if (type && type !== 'all') filter.type = type;
  if (q) clauses.push({ $or: [{ description: new RegExp(q, 'i') }, { paidTo: new RegExp(q, 'i') }, { note: new RegExp(q, 'i') }] });
  if (clauses.length) filter.$and = clauses;
  if (req.user.role === 'labour') filter.workerId = req.user.workerId;
  const rows = await Expense.find(filter).sort({ date: -1, createdAt: -1 }).limit(5000)
    .populate('userId', 'name loginId').populate('projectId', 'name').populate('workerId', 'name');
  res.json(rows);
});

router.post('/', allowRoles('master', 'admin'), async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  if (!b.date || !amount || !String(b.description || '').trim()) return res.status(400).json({ message: 'Date, amount and description are required' });
  const category = String(b.category || 'Other');
  if (!canAccessAccountingCategory(req.user, category)) return res.status(403).json({ message: 'You do not have access to this accounting category' });
  const project = b.projectId ? await Project.findOne({ _id: b.projectId, deletedAt: null }) : null;
  if (b.projectId && !project) return res.status(400).json({ message: 'Project not found' });
  const worker = b.workerId ? await Worker.findOne({ _id: b.workerId, deletedAt: null }) : null;
  if (b.workerId && !worker) return res.status(400).json({ message: 'Worker not found' });
  if (project && !canAccessProject(req.user, project._id)) return res.status(403).json({ message: 'Project is not assigned to this admin' });
  if (worker && !canAccessWorker(req.user, worker)) return res.status(403).json({ message: 'Labour is not assigned to this admin' });
  if (!canAccessExpense(req.user, { projectId: project?._id, workerId: worker?._id })) return res.status(403).json({ message: 'This expense is outside your assigned data' });
  const expense = await Expense.create({
    date: String(b.date), userId: req.user._id, projectId: project?._id || null, type: ['Work Expense','Labour Payment','Material Payment','Other Payment'].includes(b.type) ? b.type : 'Work Expense',
    category, workerId: worker?._id || null, amount, paidTo: String(b.paidTo || '').trim(),
    description: String(b.description).trim(), mode: String(b.mode || 'Cash'), receiptNo: String(b.receiptNo || '').trim(), note: String(b.note || '').trim()
  });
  await audit(req.user._id, 'create_expense', 'Expense', expense._id, { amount, type: expense.type });
  res.status(201).json(expense);
});

router.patch('/:id', allowRoles('master', 'admin'), async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, deletedAt: null, ...expenseAccessFilter(req.user) });
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  const b = req.body || {};
  const category = b.category === undefined ? expense.category : String(b.category);
  if (!canAccessAccountingCategory(req.user, category)) return res.status(403).json({ message: 'You do not have access to this accounting category' });
  const projectId = b.projectId === undefined ? expense.projectId : b.projectId;
  const workerId = b.workerId === undefined ? expense.workerId : b.workerId;
  const project = projectId ? await Project.findOne({ _id: projectId, deletedAt: null }) : null;
  if (projectId && !project) return res.status(400).json({ message: 'Project not found' });
  const worker = workerId ? await Worker.findOne({ _id: workerId, deletedAt: null }) : null;
  if (workerId && !worker) return res.status(400).json({ message: 'Worker not found' });
  if (project && !canAccessProject(req.user, project._id)) return res.status(403).json({ message: 'Project is not assigned to this admin' });
  if (worker && !canAccessWorker(req.user, worker)) return res.status(403).json({ message: 'Labour is not assigned to this admin' });
  if (!canAccessExpense(req.user, { projectId: project?._id, workerId: worker?._id })) return res.status(403).json({ message: 'This expense is outside your assigned data' });
  for (const f of ['date','type','category','paidTo','description','mode','receiptNo','note']) if (b[f] !== undefined) expense[f] = String(b[f]);
  if (b.projectId !== undefined) expense.projectId = project?._id || null;
  if (b.workerId !== undefined) expense.workerId = worker?._id || null;
  if (b.amount !== undefined) expense.amount = Math.max(0, Number(b.amount || 0));
  await expense.save();
  await audit(req.user._id, 'update_expense', 'Expense', expense._id, { fields: Object.keys(b) });
  res.json(expense);
});

router.delete('/:id', allowRoles('master', 'admin'), async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, deletedAt: null, ...expenseAccessFilter(req.user) });
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  if (!canAccessAccountingCategory(req.user, expense.category)) return res.status(403).json({ message: 'You do not have access to this accounting category' });
  expense.deletedAt = new Date(); expense.deletedBy = req.user._id; await expense.save();
  await audit(req.user._id, 'delete_expense', 'Expense', expense._id, { amount: expense.amount });
  res.json({ message: 'Expense deleted (soft delete)' });
});

export default router;