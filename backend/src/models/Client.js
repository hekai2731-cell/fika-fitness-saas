import mongoose from 'mongoose';

const ClientSchema = new mongoose.Schema({
  // 基本信息
  id: { type: String, required: true, unique: true },
  roadCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'], required: false, default: 'other' },
  age: { type: Number, required: true },
  height: { type: Number },
  weight: { type: Number },
  tier: { type: String, enum: ['standard', 'pro', 'ultra'], default: 'standard' },
  goal: { type: String },
  weeks: { type: Number, default: 12 },
  weeks_total: { type: Number },
  injury: { type: String, default: '' },
  dailyLogs: [{ type: mongoose.Schema.Types.Mixed }],
  
  // 教练关联
  coachCode: { type: String, required: false, default: '' },
  coachName: { type: String, default: '' },
  
  // 训练数据
  blocks: [{ type: mongoose.Schema.Types.Mixed }],
  sessions: [{ type: mongoose.Schema.Types.Mixed }],
  weeklyData: [{ type: mongoose.Schema.Types.Mixed }],
  dietPlans: [{ type: mongoose.Schema.Types.Mixed }],
  
  // 评估数据
  metrics: { type: mongoose.Schema.Types.Mixed },
  assessments: { type: mongoose.Schema.Types.Mixed },
  profile: { type: mongoose.Schema.Types.Mixed },
  ltv_score: { type: Number },
  bodyMetrics: { type: mongoose.Schema.Types.Mixed },
  goal_type: { type: String, enum: ['muscle_gain', 'fat_loss', 'performance', 'rehabilitation'] },
  injury_detail: {
    area: { type: String },
    level: { type: String, enum: ['mild', 'moderate', 'avoid'] },
    forbidden_moves: { type: String },
    surgery_history: { type: String },
  },
  
  // 发布相关
  published_blocks: [{ type: mongoose.Schema.Types.Mixed }],
  plan_draft_version: { type: Number, default: 1 },
  plan_draft_status: { type: String, enum: ['draft', 'review_ready', 'published', 'archived'], default: 'draft' },
  plan_published_version: { type: Number, default: 0 },
  plan_published_at: { type: Date },
  plan_updated_at: { type: Date },
  plan_publish_history: [{ type: mongoose.Schema.Types.Mixed }],
  current_week: { type: Number, default: 1 },
  current_day: { type: String },
  current_day_id: { type: String },
  current_block_id: { type: String },
  
  // 会员信息
  membershipLevel: { type: String, enum: ['standard', 'advanced', 'professional', 'elite'] },
  
  // 软删除
  deletedAt: { type: Date },
  deletedByCoachCode: { type: String },
  deletedByCoachName: { type: String },
  
  // 时间戳
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  collection: 'fika_clients'
});

// 索引 - unique字段已经自动创建索引，只需要额外的查询索引
ClientSchema.index({ coachCode: 1 });
ClientSchema.index({ deletedAt: 1 });

// 软删除查询助手
ClientSchema.pre(/^find/, function() {
  this.where({ deletedAt: { $exists: false } });
});

export const Client = mongoose.model('Client', ClientSchema);
