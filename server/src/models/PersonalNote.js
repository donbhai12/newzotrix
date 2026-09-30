import mongoose from 'mongoose';

const personalNoteSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  content: { type: String, trim: true, maxlength: 5000, default: '' },
  color: { type: String, enum: ['mint','gold','blue','rose','violet'], default: 'mint' },
  pinned: { type: Boolean, default: false, index: true }
}, { timestamps: true });

personalNoteSchema.index({ ownerId: 1, pinned: -1, updatedAt: -1 });
export default mongoose.model('PersonalNote', personalNoteSchema);
