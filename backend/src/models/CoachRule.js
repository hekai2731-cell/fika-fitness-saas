import mongoose from 'mongoose';

const CoachRuleSchema = new mongoose.Schema({
  coachCode: { type: String, required: true, index: true },
  clientId:  { type: String, index: true },  // null = 教练全局规则
  rule:      { type: String, required: true }, // 自然语言，直接注入 prompt
  source:    { type: String, enum: ['manual', 'auto_diff'], default: 'manual' },
  context:   { type: mongoose.Schema.Types.Mixed }, // 记录是什么情境下产生的
  active:    { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'fika_coach_rules' });

export const CoachRule = mongoose.model('CoachRule', CoachRuleSchema);
