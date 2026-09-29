import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
  date: { type: String, required: true, index: true },
  status: { type: String, enum: ['P', 'H', 'A'], required: true },
  otHours: { type: Number, min: 0, default: 0 },
  lateMinutes: { type: Number, min: 0, default: 0 },
  note: { type: String, maxlength: 500, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

attendanceSchema.index({ workerId: 1, date: 1 }, { unique: true });
export default mongoose.model('Attendance', attendanceSchema);
