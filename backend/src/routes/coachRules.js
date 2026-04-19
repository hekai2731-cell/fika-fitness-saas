import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { CoachRule } from '../models/CoachRule.js';

const router = Router();

// GET /api/coach-rules?coachCode=xxx&clientId=xxx
// coachCode 可不传，不传时返回所有 active 规则
router.get('/', async (req, res) => {
  try {
    const { coachCode, clientId } = req.query;

    const query = { active: true };
    if (coachCode) query.coachCode = String(coachCode);
    if (clientId !== undefined) {
      query.clientId = clientId ? String(clientId) : null;
    }

    const rules = await CoachRule.find(query).sort({ createdAt: -1 }).lean();
    res.json(rules);
  } catch (err) {
    console.error('[coachRules] GET failed:', err);
    res.status(500).json({ error: 'query failed', details: String(err) });
  }
});

// POST /api/coach-rules
router.post('/', async (req, res) => {
  try {
    const { coachCode, clientId, rule, source, context } = req.body || {};
    if (!coachCode || !rule) {
      return res.status(400).json({ error: 'coachCode and rule are required' });
    }

    const doc = await CoachRule.create({
      coachCode: String(coachCode),
      clientId: clientId ? String(clientId) : null,
      rule: String(rule),
      source: source || 'manual',
      context: context || null,
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('[coachRules] POST failed:', err);
    res.status(500).json({ error: 'create failed', details: String(err) });
  }
});

// DELETE /api/coach-rules/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const doc = await CoachRule.findByIdAndUpdate(id, { active: false }, { new: true });
    if (!doc) return res.status(404).json({ error: 'rule not found' });

    res.json({ success: true, id });
  } catch (err) {
    console.error('[coachRules] DELETE failed:', err);
    res.status(500).json({ error: 'delete failed', details: String(err) });
  }
});

export default router;
