import express from 'express';
import Setting from '../models/Setting.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = express.Router();

router.get('/public', async (_req, res) => {
  const settings = await getSettings();
  res.json({ businessName: settings.businessName, logoUrl: settings.logoUrl });
});

router.use(requireAuth);

async function getSettings() {
  const settings = await Setting.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true });
  if (settings.businessName === 'ZOTRIX') {
    settings.businessName = 'Zotrix Research Private Ltd';
    await settings.save();
  }
  return settings;
}

router.get('/', async (_req, res) => res.json(await getSettings()));

router.patch('/', allowRoles('master'), async (req, res) => {
  const b = req.body || {};
  const s = await getSettings();
  if (b.businessName !== undefined) s.businessName = String(b.businessName).trim() || 'Zotrix Research Private Ltd';
  if (b.logoUrl !== undefined) s.logoUrl = String(b.logoUrl || '');
  for (const f of ['categories','modes','entryTypes']) if (Array.isArray(b[f]) && b[f].length) s[f] = b[f].map(String).map(x => x.trim()).filter(Boolean);
  await s.save();
  await audit(req.user._id, 'update_settings', 'Setting', s._id, { fields: Object.keys(b) });
  res.json(s);
});

export default router;
