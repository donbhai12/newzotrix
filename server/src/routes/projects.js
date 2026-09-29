import express from 'express';
import Project from '../models/Project.js';
import { allowRoles, projectAccessFilter, requireAuth } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const filter = { deletedAt: null, ...projectAccessFilter(req.user) };
  const projects = await Project.find(filter).sort({ createdAt: -1 });
  res.json(projects);
});

router.post('/', allowRoles('master'), async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ message: 'Project name is required' });
  const project = await Project.create({
    name: String(b.name).trim(), code: String(b.code || '').trim(), client: String(b.client || '').trim(),
    location: String(b.location || '').trim(), budget: Math.max(0, Number(b.budget || 0)),
    progress: Math.max(0, Math.min(100, Number(b.progress || 0))), start: String(b.start || ''), end: String(b.end || ''),
    status: ['Active','Planning','Hold','Completed'].includes(b.status) ? b.status : 'Active'
  });
  await audit(req.user._id, 'create_project', 'Project', project._id, { name: project.name });
  res.status(201).json(project);
});

router.patch('/:id', allowRoles('master'), async (req, res) => {
  const b = req.body || {};
  const project = await Project.findOne({ _id: req.params.id, deletedAt: null });
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const fields = ['name','code','client','location','start','end','status'];
  for (const f of fields) if (b[f] !== undefined) project[f] = String(b[f]).trim();
  if (b.budget !== undefined) project.budget = Math.max(0, Number(b.budget || 0));
  if (b.progress !== undefined) project.progress = Math.max(0, Math.min(100, Number(b.progress || 0)));
  await project.save();
  await audit(req.user._id, 'update_project', 'Project', project._id, { fields: Object.keys(b) });
  res.json(project);
});

router.delete('/:id', allowRoles('master'), async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, deletedAt: null });
  if (!project) return res.status(404).json({ message: 'Project not found' });
  project.deletedAt = new Date();
  await project.save();
  await audit(req.user._id, 'delete_project', 'Project', project._id);
  res.json({ message: 'Project deleted' });
});

export default router;
