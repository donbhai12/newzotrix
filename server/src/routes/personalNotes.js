import express from 'express';
import PersonalNote from '../models/PersonalNote.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = express.Router();
router.use(requireAuth, allowRoles('admin'));
const noteColors = ['mint','gold','blue','rose','violet'];

router.get('/', async (req, res) => {
  const notes = await PersonalNote.find({ ownerId: req.user._id }).sort({ pinned: -1, updatedAt: -1 });
  res.json(notes);
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title && !content) return res.status(400).json({ message: 'Add a title or some note text first' });
  if (title.length > 120 || content.length > 5000) return res.status(400).json({ message: 'Notes can have a title up to 120 characters and text up to 5,000 characters' });
  const note = await PersonalNote.create({
    ownerId: req.user._id, title: title || 'Untitled note', content,
    color: noteColors.includes(body.color) ? body.color : 'mint', pinned: body.pinned === true
  });
  await audit(req.user._id, 'create_personal_note', 'PersonalNote', note._id);
  res.status(201).json(note);
});

router.patch('/:id', async (req, res) => {
  const note = await PersonalNote.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!note) return res.status(404).json({ message: 'Note not found' });
  const body = req.body || {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title && !String(body.content ?? note.content).trim()) return res.status(400).json({ message: 'Add a title or some note text first' });
    if (title.length > 120) return res.status(400).json({ message: 'Note title can be up to 120 characters' });
    note.title = title || 'Untitled note';
  }
  if (body.content !== undefined) {
    const content = String(body.content).trim();
    if (content.length > 5000) return res.status(400).json({ message: 'Note text can be up to 5,000 characters' });
    note.content = content;
    if (!note.title && content) note.title = 'Untitled note';
  }
  if (body.color !== undefined && noteColors.includes(body.color)) note.color = body.color;
  if (body.pinned !== undefined) note.pinned = body.pinned === true;
  await note.save();
  await audit(req.user._id, 'update_personal_note', 'PersonalNote', note._id, { fields: Object.keys(body) });
  res.json(note);
});

router.delete('/:id', async (req, res) => {
  const note = await PersonalNote.findOneAndDelete({ _id: req.params.id, ownerId: req.user._id });
  if (!note) return res.status(404).json({ message: 'Note not found' });
  await audit(req.user._id, 'delete_personal_note', 'PersonalNote', note._id);
  res.json({ message: 'Note deleted' });
});

export default router;
