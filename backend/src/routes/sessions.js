import { Router } from 'express';
import { Session } from '../models/Session.js';

const router = Router();

// GET /api/sessions?clientId=xxx
router.get('/', async (req, res) => {
  try {
    const { clientId, coachCode, limit = 50 } = req.query;
    const query = {};
    if (clientId) query.clientId = String(clientId);
    if (coachCode) query.coachCode = String(coachCode);
    const sessions = await Session.find(query)
      .sort({ date: -1 })
      .limit(Math.min(200, Number(limit)))
      .lean();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions', details: String(err) });
  }
});

// GET /api/sessions/:id
router.get('/:id', async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session', details: String(err) });
  }
});

// POST /api/sessions — 创建上课记录
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.clientId) return res.status(400).json({ error: 'clientId is required' });
    if (!data.date) data.date = new Date();
    const session = await Session.create(data);
    res.json({ success: true, id: session._id, session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create session', details: String(err) });
  }
});

// PUT /api/sessions/:id — 更新上课记录
router.put('/:id', async (req, res) => {
  try {
    const session = await Session.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update session', details: String(err) });
  }
});

// DELETE /api/sessions/:id
router.delete('/:id', async (req, res) => {
  try {
    await Session.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session', details: String(err) });
  }
});

export default router;
