import mongoose from 'mongoose';

const workerSchema = new mongoose.Schema({
  legacyId: { type: String, index: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 140 },
  fatherName: { type: String, trim: true, maxlength: 140, default: '' },
  role: { type: String, trim: true, maxlength: 100, default: 'Labour' },
  mobile: { type: String, trim: true, maxlength: 30, default: '' },
  wage: { type: Number, min: 0, default: 0 },
  otRate: { type: Number, min: 0, default: 0 },
  joining: { type: String, default: '' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
  status: { type: String, enum: ['Active', 'Stopped', 'Deleted'], default: 'Active', index: true },
  stopDate: { type: String, default: '' },
  stopReason: { type: String, default: '' },
  bankName: { type: String, default: '' },
  accountHolder: { type: String, default: '' },
  accountNo: { type: String, default: '' },
  ifsc: { type: String, default: '' },
  upiId: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('Worker', workerSchema);
