import { Router } from 'express';
import { AiDraft } from '../models/AiDraft.js';
import { TrainingPlan } from '../models/TrainingPlan.js';
import { generateSessionPlan } from '../sessionPlan.js';
import { generateWeekPlan, generateFullPlan } from '../planning.js';
import { generateDietPlan } from '../dietPlan.js';

const router = Router();

// POST /api/ai/generate — 生成草稿并保存
router.post('/generate', async (req, res) => {
  try {
    const payload = req.body || {};
    const { planType, clientId, coachCode } = payload;

    if (!planType) return res.status(400).json({ error: 'planType is required' });

    let result;
    if (planType === 'session') result = await generateSessionPlan(payload);
    else if (planType === 'week') result = await generateWeekPlan(payload);
    else if (planType === 'full') result = await generateFullPlan(payload);
    else if (planType === 'diet') result = await generateDietPlan(payload);
    else return res.status(400).json({ error: `Unknown planType: ${planType}` });

    if (result?.error) return res.status(500).json(result);

    // 存草稿
    const draft = await AiDraft.create({
      clientId: clientId || 'unknown',
      coachCode: coachCode || '',
      planType,
      input_payload: payload,
      output_result: result,
      status: 'pending',
    });

    res.json({ success: true, draftId: draft._id, result });
  } catch (err) {
    res.status(500).json({ error: 'AI generation failed', details: String(err) });
  }
});

// POST /api/ai/drafts — 直接保存草稿（不触发生成）
router.post('/drafts', async (req, res) => {
  try {
    const { clientId, coachCode, planType, input_payload, output_result } = req.body || {};
    if (!clientId || !planType || !output_result) {
      return res.status(400).json({ error: 'clientId, planType, output_result are required' });
    }
    const draft = await AiDraft.create({
      clientId: String(clientId),
      coachCode: coachCode || '',
      planType: String(planType),
      input_payload: input_payload || {},
      output_result,
      status: 'pending',
    });
    res.json({ success: true, draftId: draft._id, draft: draft.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save draft', details: String(err) });
  }
});

// GET /api/ai/drafts/:clientId — 读取某客户的草稿列表
router.get('/drafts/:clientId', async (req, res) => {
  try {
    const { status, planType } = req.query;
    const query = { clientId: String(req.params.clientId) };
    if (status) query.status = String(status);
    if (planType) query.planType = String(planType);
    const drafts = await AiDraft.find(query).sort({ createdAt: -1 }).limit(20).lean();
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drafts', details: String(err) });
  }
});

// GET /api/ai/drafts?clientId=xxx&status=pending
router.get('/drafts', async (req, res) => {
  try {
    const { clientId, coachCode, status, planType } = req.query;
    const query = {};
    if (clientId) query.clientId = String(clientId);
    if (coachCode) query.coachCode = String(coachCode);
    if (status) query.status = String(status);
    if (planType) query.planType = String(planType);
    const drafts = await AiDraft.find(query).sort({ createdAt: -1 }).lean();
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drafts', details: String(err) });
  }
});

// POST /api/ai/drafts/:id/approve — 教练确认草稿，推送到 TrainingPlan
router.post('/drafts/:id/approve', async (req, res) => {
  try {
    const { target_plan_id, target_week_id, target_day_id } = req.body || {};
    const draft = await AiDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'pending') return res.status(400).json({ error: 'Draft already processed' });

    draft.status = 'approved';
    draft.approved_at = new Date();
    if (target_plan_id) draft.target_plan_id = target_plan_id;
    if (target_week_id) draft.target_week_id = target_week_id;
    if (target_day_id) draft.target_day_id = target_day_id;
    await draft.save();

    res.json({ success: true, draft: draft.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve draft', details: String(err) });
  }
});

// POST /api/ai/drafts/:id/reject — 教练拒绝草稿
router.post('/drafts/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body || {};
    const draft = await AiDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    draft.status = 'rejected';
    draft.rejected_at = new Date();
    draft.reject_reason = reason || '';
    await draft.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject draft', details: String(err) });
  }
});

export default router;
