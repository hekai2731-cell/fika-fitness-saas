import { Router } from 'express';
import { Finance } from '../models/Finance.js';

const router = Router();

// GET /api/finances?clientId=xxx
router.get('/', async (req, res) => {
  try {
    const { clientId, coachCode, type } = req.query;
    const query = {};
    if (clientId) query.clientId = String(clientId);
    if (coachCode) query.coachCode = String(coachCode);
    if (type) query.type = String(type);
    const records = await Finance.find(query).sort({ date: -1 }).lean();

    // 附带汇总
    const totalPurchased = records
      .filter(r => r.type === 'purchase')
      .reduce((s, r) => s + (r.sessions_count || 0), 0);
    const totalConsumed = records
      .filter(r => r.type === 'consumption')
      .reduce((s, r) => s + (r.sessions_count || 0), 0);
    const totalRefunded = records
      .filter(r => r.type === 'refund')
      .reduce((s, r) => s + (r.sessions_count || 0), 0);

    res.json({
      records,
      summary: {
        sessions_purchased: totalPurchased,
        sessions_consumed: totalConsumed,
        sessions_refunded: totalRefunded,
        sessions_remaining: totalPurchased - totalConsumed - totalRefunded,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch finances', details: String(err) });
  }
});

// POST /api/finances — 创建记录（购课/消课/退款）
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.clientId) return res.status(400).json({ error: 'clientId is required' });
    if (!data.type) return res.status(400).json({ error: 'type is required' });
    const record = await Finance.create(data);
    res.json({ success: true, id: record._id, record });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create finance record', details: String(err) });
  }
});

// DELETE /api/finances/:id
router.delete('/:id', async (req, res) => {
  try {
    await Finance.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete finance record', details: String(err) });
  }
});

export default router;
