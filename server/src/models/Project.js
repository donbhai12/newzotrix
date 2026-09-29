import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  legacyId: { type: String, index: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  code: { type: String, trim: true, maxlength: 60, default: '' },
  client: { type: String, trim: true, maxlength: 160, default: '' },
  location: { type: String, trim: true, maxlength: 240, default: '' },
  budget: { type: Number, min: 0, default: 0 },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Planning', 'Hold', 'Completed'], default: 'Active', index: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('Project', projectSchema);
