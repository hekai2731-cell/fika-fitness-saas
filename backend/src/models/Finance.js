import mongoose from 'mongoose';

const FinanceSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  coachCode: { type: String, default: '' },

  type: {
    type: String,
    enum: ['purchase', 'consumption', 'refund', 'adjustment'],
    required: true,
    index: true,
  },

  // 课时
  sessions_count: { type: Number, default: 0 },
  sessions_remaining: { type: Number },

  // 财务
  amount: { type: Number, default: 0 },
  package_type: {
    type: String,
    enum: ['standard', 'advanced', 'professional', 'elite'],
  },

  date: { type: Date, default: Date.now, index: true },
  note: { type: String },

  // 关联某节课（consumption 类型时）
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
}, {
  timestamps: true,
  collection: 'fika_finances',
});

FinanceSchema.index({ clientId: 1, date: -1 });
FinanceSchema.index({ coachCode: 1, date: -1 });

export const Finance = mongoose.model('Finance', FinanceSchema);
