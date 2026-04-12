import mongoose from 'mongoose';

const AiDraftSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  coachCode: { type: String, default: '' },

  planType: {
    type: String,
    enum: ['session', 'week', 'full', 'diet'],
    required: true,
    index: true,
  },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },

  input_payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  output_result: { type: mongoose.Schema.Types.Mixed, default: {} },

  approved_at: { type: Date },
  rejected_at: { type: Date },
  reject_reason: { type: String },

  // 确认后关联到哪个 TrainingPlan
  target_plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingPlan' },
  target_week_id: { type: String },
  target_day_id: { type: String },
}, {
  timestamps: true,
  collection: 'fika_ai_drafts',
});

AiDraftSchema.index({ clientId: 1, createdAt: -1 });
AiDraftSchema.index({ coachCode: 1, status: 1 });

export const AiDraft = mongoose.model('AiDraft', AiDraftSchema);
