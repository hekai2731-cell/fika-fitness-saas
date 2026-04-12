import mongoose from 'mongoose';

const TrainingPlanSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  coachCode: { type: String, default: '' },

  status: {
    type: String,
    enum: ['draft', 'review_ready', 'published', 'archived'],
    default: 'draft',
    index: true,
  },

  draft_version: { type: Number, default: 1 },
  published_version: { type: Number, default: 0 },
  published_at: { type: Date },
  updated_at: { type: Date },

  blocks: [{ type: mongoose.Schema.Types.Mixed }],
  published_blocks: [{ type: mongoose.Schema.Types.Mixed }],

  // 只存摘要，不存完整 blocks 副本
  publish_history: [{
    version: Number,
    published_at: Date,
    published_by: {
      coachCode: String,
      coachName: String,
    },
    summary: {
      block_count: Number,
      week_count: Number,
      day_count: Number,
    },
  }],
}, {
  timestamps: true,
  collection: 'fika_training_plans',
});

TrainingPlanSchema.index({ clientId: 1, status: 1 });
TrainingPlanSchema.index({ coachCode: 1 });

export const TrainingPlan = mongoose.model('TrainingPlan', TrainingPlanSchema);
