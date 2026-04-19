import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  coachCode: { type: String, default: '' },

  date: { type: Date, required: true, index: true },
  week: { type: Number },
  day: { type: String },

  // 上课时长和费用
  duration: { type: Number },
  price: { type: Number },
  level: { type: Number },

  // 训练质量
  rpe: { type: Number },
  performance: { type: String },
  note: { type: String },

  // 心率数据
  hrAvg: { type: Number },
  hrMax: { type: Number },
  hrMin: { type: Number },
  hrZoneDurations: { type: mongoose.Schema.Types.Mixed },
  kcal: { type: Number },

  // 关联训练规划（可选）
  plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingPlan' },
  plan_day_id: { type: String },
  block_index: { type: Number },
  block_week: { type: Number },

  // 课前评估数据
  pre_session_data: { type: mongoose.Schema.Types.Mixed },

  // 实际执行的动作详情（教练记录）
  exercises: [{ type: mongoose.Schema.Types.Mixed }],
}, {
  timestamps: true,
  collection: 'fika_sessions',
});

SessionSchema.index({ clientId: 1, date: -1 });
SessionSchema.index({ coachCode: 1, date: -1 });

export const Session = mongoose.model('Session', SessionSchema);
