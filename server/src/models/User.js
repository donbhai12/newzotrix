import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  legacyId: { type: String, index: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  loginId: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 80 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['master', 'admin', 'labour'], required: true, index: true },
  mobile: { type: String, trim: true, maxlength: 30, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
  jobRole: { type: String, trim: true, maxlength: 100, default: '' },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
  initials: { type: String, trim: true, maxlength: 4, default: '' },
  photoUrl: { type: String, default: '' },
  accountingCategories: { type: [String], default: ['*'] },
  accessControlEnabled: { type: Boolean, default: false },
  allProjectAccess: { type: Boolean, default: false },
  projectAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  allWorkerAccess: { type: Boolean, default: false },
  workerAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Worker' }],
  unassignedExpenseAccess: { type: Boolean, default: false },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export default mongoose.model('User', userSchema);