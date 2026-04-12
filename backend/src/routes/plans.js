import { Router } from 'express';
import { TrainingPlan } from '../models/TrainingPlan.js';

const router = Router();

// GET /api/plans?clientId=xxx
router.get('/', async (req, res) => {
  try {
    const { clientId, coachCode, status } = req.query;
    const query = {};
    if (clientId) query.clientId = String(clientId);
    if (coachCode) query.coachCode = String(coachCode);
    if (status) query.status = String(status);
    const plans = await TrainingPlan.find(query).lean();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plans', details: String(err) });
  }
});

// GET /api/plans/:id
router.get('/:id', async (req, res) => {
  try {
    const plan = await TrainingPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plan', details: String(err) });
  }
});

// POST /api/plans — 创建
router.post('/', async (req, res) => {
  try {
    const plan = await TrainingPlan.create(req.body);
    res.json({ success: true, id: plan._id, plan });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create plan', details: String(err) });
  }
});

// PUT /api/plans/:id — 更新草稿
router.put('/:id', async (req, res) => {
  try {
    const { blocks, status, coachCode } = req.body;
    const update = { updatedAt: new Date() };
    if (blocks !== undefined) {
      update.blocks = blocks;
      update.$inc = { draft_version: 1 };
      update.updated_at = new Date();
      update.status = 'draft';
    }
    if (status !== undefined) update.status = status;
    if (coachCode !== undefined) update.coachCode = coachCode;

    const plan = await TrainingPlan.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update plan', details: String(err) });
  }
});

// POST /api/plans/:id/publish — 发布到学员端
router.post('/:id/publish', async (req, res) => {
  try {
    const { publishedByCoachCode, publishedByCoachName } = req.body || {};
    const plan = await TrainingPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
    if (blocks.length === 0) return res.status(400).json({ error: 'No draft blocks to publish' });

    const publishedAt = new Date();
    const draftVersion = Number(plan.draft_version || 1);
    const history = Array.isArray(plan.publish_history) ? [...plan.publish_history] : [];

    history.push({
      version: draftVersion,
      published_at: publishedAt,
      published_by: { coachCode: publishedByCoachCode || null, coachName: publishedByCoachName || null },
      summary: {
        block_count: blocks.length,
        week_count: blocks.reduce((s, b) => s + (Array.isArray(b.training_weeks) ? b.training_weeks.length : 0), 0),
        day_count: blocks.reduce((s, b) => s + (Array.isArray(b.training_weeks) ? b.training_weeks.reduce((ws, w) => ws + (Array.isArray(w.days) ? w.days.length : 0), 0) : 0), 0),
      },
    });

    plan.published_blocks = JSON.parse(JSON.stringify(blocks));
    plan.status = 'published';
    plan.published_version = draftVersion;
    plan.published_at = publishedAt;
    plan.publish_history = history;
    await plan.save();

    res.json({ success: true, plan: plan.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish plan', details: String(err) });
  }
});

// POST /api/plans/:id/rollback — 回滚
router.post('/:id/rollback', async (req, res) => {
  try {
    const { version } = req.body || {};
    const plan = await TrainingPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const history = Array.isArray(plan.publish_history) ? plan.publish_history : [];
    if (history.length === 0) return res.status(400).json({ error: 'No publish history to rollback' });

    const currentVersion = Number(plan.published_version || 0);
    let targetMeta = version != null
      ? history.find((item) => Number(item?.version) === Number(version)) || null
      : history.filter((item) => Number(item?.version) !== currentVersion).at(-1) || null;

    if (!targetMeta) return res.status(400).json({ error: 'Rollback target not found' });

    plan.status = 'published';
    plan.published_version = Number(targetMeta.version || 0);
    plan.published_at = targetMeta.published_at ? new Date(targetMeta.published_at) : new Date();
    await plan.save();

    res.json({ success: true, plan: plan.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rollback plan', details: String(err) });
  }
});

export default router;
