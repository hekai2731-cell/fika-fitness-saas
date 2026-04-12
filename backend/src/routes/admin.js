import { Router } from 'express';
import { Client } from '../models/Client.js';
import { Session } from '../models/Session.js';
import { Finance } from '../models/Finance.js';
import { Coach } from '../models/Coach.js';

const router = Router();

// 管理端鉴权中间件
function requireAdminToken(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Admin secret not configured' });
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  if (!token || token !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use(requireAdminToken);

// GET /api/admin/dashboard — 全局概览
router.get('/dashboard', async (req, res) => {
  try {
    const [totalClients, totalCoaches, recentSessions, recentFinances] = await Promise.all([
      Client.countDocuments(),
      Coach.countDocuments(),
      Session.find().sort({ date: -1 }).limit(20).lean(),
      Finance.find().sort({ date: -1 }).limit(50).lean(),
    ]);

    const totalRevenue = recentFinances
      .filter(f => f.type === 'purchase')
      .reduce((s, f) => s + (f.amount || 0), 0);

    res.json({
      totalClients,
      totalCoaches,
      totalRevenue,
      recentSessions: recentSessions.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard query failed', details: String(err) });
  }
});

// GET /api/admin/clients — 所有客户（含已删除）
router.get('/clients', async (req, res) => {
  try {
    const clients = await Client.collection.find({}).toArray();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all clients', details: String(err) });
  }
});

// GET /api/admin/debug-data
router.get('/debug-data', async (req, res) => {
  try {
    const allRecords = await Client.collection.find({}).toArray();
    const activeRecords = allRecords.filter(r => !r.deletedAt);
    const deletedRecords = allRecords.filter(r => r.deletedAt);
    res.json({
      totalRecords: allRecords.length,
      activeRecords: activeRecords.length,
      deletedRecords: deletedRecords.length,
      sampleRecords: allRecords.slice(0, 5).map(r => ({
        id: r.id, name: r.name, coachCode: r.coachCode, deletedAt: r.deletedAt, updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Debug failed', details: String(err) });
  }
});

// POST /api/admin/cleanup-duplicates
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    let totalCleaned = 0;
    const duplicateIds = await Client.aggregate([
      { $group: { _id: '$id', count: { $sum: 1 }, docs: { $push: { _id: '$_id', updatedAt: '$updatedAt' } } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    for (const dup of duplicateIds) {
      dup.docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      const toDelete = dup.docs.slice(1);
      if (toDelete.length > 0) {
        await Client.deleteMany({ _id: { $in: toDelete.map(d => d._id) } });
        totalCleaned += toDelete.length;
      }
    }
    res.json({ success: true, cleanedRecords: totalCleaned });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed', details: String(err) });
  }
});

export default router;
