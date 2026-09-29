import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  businessName: { type: String, default: 'Zotrix Research Private Ltd' },
  logoUrl: { type: String, default: '' },
  categories: { type: [String], default: ['Labour','Material','Transport','Diesel','Food','Tools','Machinery','Site','Office','Travel','Other'] },
  modes: { type: [String], default: ['Cash','Bank Transfer','UPI','Cheque','Card','Other'] },
  entryTypes: { type: [String], default: ['Work Expense','Labour Payment','Material Payment','Other Payment'] }
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);
