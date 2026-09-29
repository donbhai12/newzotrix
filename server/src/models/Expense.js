import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  legacyId: { type: String, index: true, sparse: true },
  date: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
  type: { type: String, enum: ['Work Expense', 'Labour Payment', 'Material Payment', 'Other Payment'], default: 'Work Expense', index: true },
  category: { type: String, trim: true, maxlength: 80, default: 'Other' },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
  amount: { type: Number, required: true, min: 0 },
  paidTo: { type: String, trim: true, maxlength: 160, default: '' },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  mode: { type: String, trim: true, maxlength: 50, default: 'Cash' },
  receiptNo: { type: String, trim: true, maxlength: 100, default: '' },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export default mongoose.model('Expense', expenseSchema);
