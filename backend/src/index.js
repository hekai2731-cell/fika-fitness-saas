import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { isValidObjectId } from 'mongoose';
import { generateSessionPlan } from './sessionPlan.js';
import { generateWeekPlan, generateFullPlan } from './planning.js';
import { generateDietPlan } from './dietPlan.js';
import { connectMongo } from './db/mongoose.js';
import { Plan } from './models/Plan.js';
import { Client } from './models/Client.js';
import { Coach } from './models/Coach.js';
import clientsRouter from './routes/clients.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// MongoDB 云同步路由 - 轻量级客户端数据同步
app.use('/api/sync/clients', clientsRouter);

const DEFAULT_TEMP_USER_ID = process.env.DEFAULT_TEMP_USER_ID || 'guest';

function normalizeActor(payload = {}) {
  const tempUserId = String(payload.tempUserId || payload.userTempId || DEFAULT_TEMP_USER_ID);
  const rawUserId = payload.userId || payload.coachId || payload.ownerId;
  const userId = isValidObjectId(rawUserId) ? rawUserId : undefined;
  return { userId, tempUserId };
}

function resolvePlanTitle(planType, payload = {}, result = {}) {
  return (
    payload.title ||
    payload.blockTitle ||
    result.session_name ||
    result.title ||
    `${planType}-plan`
  );
}

function resolveClientId(payload = {}) {
  return String(payload.clientId || payload.client_id || payload.clientName || payload.studentId || 'unknown');
}

async function persistGeneratedPlan(planType, payload = {}, result = {}) {
  const actor = normalizeActor(payload);
  const doc = await Plan.create({
    userId: actor.userId,
    tempUserId: actor.tempUserId,
    clientId: resolveClientId(payload),
    planType,
    title: resolvePlanTitle(planType, payload, result),
    payload,
    result,
    source: 'ai',
    status: 'draft',
  });
  return doc;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'fika-backend', ts: Date.now() });
});

// 调试API - 检查数据库中的实际数据
app.get('/api/admin/debug-data', async (req, res) => {
  try {
    console.log('[backend] Debugging database data...');
    
    // 1. 统计所有记录（包括软删除的）
    const allRecords = await Client.find({}).lean();
    console.log('[backend] Total records in DB:', allRecords.length);
    
    // 2. 统计未删除的记录
    const activeRecords = await Client.find({ deletedAt: { $exists: false } }).lean();
    console.log('[backend] Active records (no deletedAt):', activeRecords.length);
    
    // 3. 统计已删除的记录
    const deletedRecords = await Client.find({ deletedAt: { $exists: true } }).lean();
    console.log('[backend] Deleted records (has deletedAt):', deletedRecords.length);
    
    // 4. 显示前几条记录的详细信息
    const sampleRecords = allRecords.slice(0, 5).map(record => ({
      id: record.id,
      roadCode: record.roadCode,
      name: record.name,
      coachCode: record.coachCode,
      deletedAt: record.deletedAt,
      updatedAt: record.updatedAt
    }));
    
    res.json({
      totalRecords: allRecords.length,
      activeRecords: activeRecords.length,
      deletedRecords: deletedRecords.length,
      sampleRecords: sampleRecords,
      message: 'Database debug information'
    });
    
  } catch (err) {
    console.error('[backend] Debug failed:', err);
    res.status(500).json({ error: 'Debug failed', details: String(err) });
  }
});

// 强力数据清理API - 彻底解决重复数据问题
app.post('/api/admin/cleanup-duplicates', async (req, res) => {
  try {
    console.log('[backend] Starting aggressive duplicate data cleanup...');
    
    let totalCleaned = 0;
    
    // 方法1: 基于id清理重复数据
    const duplicateIds = await Client.aggregate([
      { $group: { _id: '$id', count: { $sum: 1 }, docs: { $push: { _id: '$_id', updatedAt: '$updatedAt' } } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    
    for (const duplicate of duplicateIds) {
      // 按更新时间排序，保留最新的
      duplicate.docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      const toKeep = duplicate.docs[0];
      const toDelete = duplicate.docs.slice(1);
      
      if (toDelete.length > 0) {
        await Client.deleteMany({ _id: { $in: toDelete.map(d => d._id) } });
        totalCleaned += toDelete.length;
        console.log(`[backend] Cleaned ${toDelete.length} duplicate records for id: ${duplicate._id}`);
      }
    }
    
    // 方法2: 基于roadCode清理重复数据
    const duplicateRoadCodes = await Client.aggregate([
      { $group: { _id: '$roadCode', count: { $sum: 1 }, docs: { $push: { _id: '$_id', updatedAt: '$updatedAt' } } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    
    for (const duplicate of duplicateRoadCodes) {
      duplicate.docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      const toKeep = duplicate.docs[0];
      const toDelete = duplicate.docs.slice(1);
      
      if (toDelete.length > 0) {
        await Client.deleteMany({ _id: { $in: toDelete.map(d => d._id) } });
        totalCleaned += toDelete.length;
        console.log(`[backend] Cleaned ${toDelete.length} duplicate records for roadCode: ${duplicate._id}`);
      }
    }
    
    // 方法3: 检查并修复MongoDB索引一致性
    try {
      await Client.collection.createIndex({ id: 1 }, { unique: true, background: true });
      await Client.collection.createIndex({ roadCode: 1 }, { unique: true, background: true });
      console.log('[backend] Index consistency verified');
    } catch (indexErr) {
      console.warn('[backend] Index verification warning:', indexErr.message);
    }
    
    console.log(`[backend] Aggressive cleanup completed. Removed ${totalCleaned} duplicate records.`);
    res.json({ 
      success: true, 
      cleanedRecords: totalCleaned,
      duplicateIdsFound: duplicateIds.length,
      duplicateRoadCodesFound: duplicateRoadCodes.length,
      message: 'Aggressive cleanup completed. All duplicate records removed.'
    });
    
  } catch (err) {
    console.error('[backend] Aggressive cleanup failed:', err);
    res.status(500).json({ error: 'Cleanup failed', details: String(err) });
  }
});

// Client data sync APIs - 强制使用MongoDB
app.get('/api/clients', async (req, res) => {
  try {
    const { coachId, tempUserId } = req.query;

    let query = {};
    if (coachId) query.coachCode = String(coachId);
    if (tempUserId) query.tempUserId = String(tempUserId);

    const clients = await Client.find(query).lean();
    res.json(clients);
  } catch (err) {
    console.error('[backend] MongoDB query failed:', err);
    res.status(500).json({ error: 'MongoDB connection failed', details: String(err) });
  }
});

app.get('/api/clients/by-road-code/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'road code required' });
    const client = await Client.findOne({ roadCode: code }).lean();
    if (!client) return res.status(404).json({ error: 'not found' });
    res.json(client);
  } catch (err) {
    console.error('[backend] Road code lookup failed:', err);
    res.status(500).json({ error: 'MongoDB operation failed', details: String(err) });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const clientData = req.body;
    
    // 移除roadCode字段避免冲突，然后单独处理
    const { roadCode, ...clientDataWithoutRoadCode } = clientData;
    
    const client = await Client.findOneAndUpdate(
      { 
        $or: [
          { id: clientData.id }, 
          { roadCode: roadCode }
        ]
      },
      { 
        ...clientDataWithoutRoadCode,
        roadCode: roadCode, // 单独设置roadCode避免冲突
        updatedAt: new Date(),
        $setOnInsert: { 
          createdAt: new Date(),
          deletedAt: undefined // 确保新创建的记录没有被删除标记
        }
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );
    
    console.log('[backend] Client upserted in MongoDB:', client.id, client.roadCode);
    res.json({ success: true, id: client.id, action: client.isNew ? 'created' : 'updated' });
  } catch (err) {
    console.error('[backend] MongoDB upsert failed:', err);
    
    // 处理重复键错误
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyPattern || {})[0];
      return res.status(409).json({ 
        error: `Duplicate ${duplicateField}`, 
        details: `The ${duplicateField} already exists`,
        code: 'DUPLICATE_KEY'
      });
    }
    
    res.status(500).json({ error: 'MongoDB operation failed', details: String(err) });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientData = req.body;
    
    // 首先清理所有重复记录，只保留最新的一个
    await Client.deleteMany({ 
      id: id,
      _id: { $ne: (await Client.findOne({ id: id }).sort({ updatedAt: -1 }))?._id }
    });
    
    // 移除roadCode字段避免冲突，然后单独处理
    const { roadCode, ...clientDataWithoutRoadCode } = clientData;
    
    const client = await Client.findOneAndUpdate(
      { id: id },
      { 
        ...clientDataWithoutRoadCode,
        roadCode: roadCode,
        updatedAt: new Date(),
        $setOnInsert: { 
          createdAt: new Date()
        }
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );
    
    console.log('[backend] Client updated in MongoDB:', id);
    res.json({ success: true, id: client.id });
  } catch (err) {
    console.error('[backend] MongoDB update failed:', err);
    
    // 处理重复键错误 - 强制清理并重新创建
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyPattern || {})[0];
      console.error('[backend] Duplicate key error on field:', duplicateField, 'value:', err.keyValue);
      
      try {
        // 强制删除所有重复记录
        await Client.deleteMany({ id: id });
        // 重新创建
        const newClient = new Client(clientData);
        await newClient.save();
        console.log('[backend] Client force recreated after conflict:', id);
        return res.json({ success: true, id: newClient.id, action: 'force-recreated' });
      } catch (retryErr) {
        console.error('[backend] Force recreation failed:', retryErr);
        return res.status(409).json({ 
          error: `Duplicate ${duplicateField}`, 
          details: `The ${duplicateField} already exists and could not be resolved`,
          code: 'DUPLICATE_KEY'
        });
      }
    }
    
    res.status(500).json({ error: 'MongoDB operation failed', details: String(err) });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deletedByCoachCode, deletedByCoachName } = req.body;
    
    const client = await Client.findOneAndUpdate(
      { id: id },
      { 
        deletedAt: new Date(),
        deletedByCoachCode: deletedByCoachCode || null,
        deletedByCoachName: deletedByCoachName || null,
        updatedAt: new Date()
      }
    );
    
    if (!client) {
      return res.status(404).json({ error: 'client not found' });
    }
    
    console.log('[backend] Client soft deleted in MongoDB:', id);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[backend] MongoDB delete failed:', err);
    res.status(500).json({ error: 'MongoDB connection failed', details: String(err) });
  }
});

// Coach data APIs
app.get('/api/coaches', async (req, res) => {
  try {
    const coaches = await Coach.find({}).lean();
    res.json(coaches);
  } catch (err) {
    console.error('[backend] Failed to fetch coaches:', err);
    res.status(500).json({ error: 'Failed to fetch coaches', details: String(err) });
  }
});

app.put('/api/coaches', async (req, res) => {
  try {
    const coaches = req.body;
    if (!Array.isArray(coaches)) {
      return res.status(400).json({ error: 'Expected an array of coaches' });
    }

    // 清除所有现有教练，然后插入新的
    await Coach.deleteMany({});

    if (coaches.length > 0) {
      await Coach.insertMany(coaches);
    }

    console.log('[backend] Coaches updated:', coaches.length);
    res.json({ success: true, count: coaches.length });
  } catch (err) {
    console.error('[backend] Failed to update coaches:', err);

    if (err.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate coach code',
        details: 'One or more coach codes already exist',
        code: 'DUPLICATE_KEY'
      });
    }

    res.status(500).json({ error: 'Failed to update coaches', details: String(err) });
  }
});

app.post('/api/session-plan', async (req, res) => {
  try {
    const payload = req.body || {};
    const plan = await generateSessionPlan(payload);
    
    // Try to save to database, but don't fail if it's not available
    try {
      const saved = await persistGeneratedPlan('session', payload, plan);
      res.json({ ...plan, planId: saved._id });
    } catch (dbErr) {
      console.log('[backend] Database save failed, returning result without persistence:', dbErr.message);
      res.json({ ...plan, planId: null, saved: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'session plan failed', details: String(err) });
  }
});

app.post('/api/week-plan', async (req, res) => {
  try {
    const payload = req.body || {};
    const plan = await generateWeekPlan(payload);
    if (plan?.error) return res.status(500).json(plan);
    
    // Try to save to database, but don't fail if it's not available
    try {
      const saved = await persistGeneratedPlan('week', payload, plan);
      res.json({ ...plan, planId: saved._id });
    } catch (dbErr) {
      console.log('[backend] Database save failed for week plan, returning result without persistence:', dbErr.message);
      res.json({ ...plan, planId: null, saved: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'week plan failed', details: String(err) });
  }
});

app.post('/api/full-plan', async (req, res) => {
  try {
    const payload = req.body || {};
    const plan = await generateFullPlan(payload);
    if (plan?.error) return res.status(500).json(plan);
    
    // Try to save to database, but don't fail if it's not available
    try {
      const saved = await persistGeneratedPlan('full', payload, plan);
      res.json({ ...plan, planId: saved._id });
    } catch (dbErr) {
      console.log('[backend] Database save failed for full plan, returning result without persistence:', dbErr.message);
      res.json({ ...plan, planId: null, saved: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'full plan failed', details: String(err) });
  }
});

app.post('/api/diet-plan', async (req, res) => {
  try {
    const payload = req.body || {};
    const plan = await generateDietPlan(payload);
    if (plan?.error) return res.status(500).json(plan);
    const saved = await persistGeneratedPlan('diet', payload, plan);
    res.json({ ...plan, planId: saved._id });
  } catch (err) {
    res.status(500).json({ error: 'diet plan failed', details: String(err) });
  }
});

app.get('/api/plans', async (req, res) => {
  try {
    const { clientId, planType, userId, tempUserId, limit } = req.query;
    const query = {};

    if (clientId) query.clientId = String(clientId);
    if (planType) query.planType = String(planType);
    if (userId && isValidObjectId(String(userId))) query.userId = String(userId);
    if (tempUserId) query.tempUserId = String(tempUserId);

    const listLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const plans = await Plan.find(query).sort({ createdAt: -1 }).limit(listLimit).lean();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: 'list plans failed', details: String(err) });
  }
});

app.get('/api/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'invalid plan id' });
    }

    const plan = await Plan.findById(id).lean();
    if (!plan) {
      return res.status(404).json({ error: 'plan not found' });
    }

    return res.json(plan);
  } catch (err) {
    return res.status(500).json({ error: 'get plan failed', details: String(err) });
  }
});

// ── 问卷招募相关接口 ────────────────────────────────────────────

// POST /api/survey/submit - 提交新问卷
app.post('/api/survey/submit', async (req, res) => {
  try {
    const { coachCode, name, phone, profile } = req.body;

    if (!coachCode || !name || !phone) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ error: 'database not available' });
    }

    const surveyPending = db.collection('survey_pending');
    const result = await surveyPending.insertOne({
      coachCode: String(coachCode).toUpperCase(),
      name: String(name).trim(),
      phone: String(phone).trim(),
      profile: profile || {},
      submittedAt: new Date(),
      status: 'pending',
    });

    res.json({ id: result.insertedId, status: 'submitted' });
  } catch (err) {
    console.error('[survey] submit failed', err);
    res.status(500).json({ error: 'submit failed', details: String(err) });
  }
});

// GET /api/survey/pending - 获取待审核问卷
app.get('/api/survey/pending', async (req, res) => {
  try {
    const { coachCode } = req.query;

    if (!coachCode) {
      return res.status(400).json({ error: 'coachCode required' });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ error: 'database not available' });
    }

    const surveyPending = db.collection('survey_pending');
    const records = await surveyPending
      .find({
        coachCode: String(coachCode).toUpperCase(),
        status: 'pending',
      })
      .sort({ submittedAt: -1 })
      .toArray();

    res.json(records);
  } catch (err) {
    console.error('[survey] pending query failed', err);
    res.status(500).json({ error: 'query failed', details: String(err) });
  }
});

// POST /api/survey/approve/:id - 审核通过，创建正式客户
app.post('/api/survey/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight, height, bf_pct, rhr, tier, coachCode } = req.body;

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ error: 'database not available' });
    }

    // 获取待审核问卷
    const surveyPending = db.collection('survey_pending');
    const survey = await surveyPending.findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!survey) {
      return res.status(404).json({ error: 'survey not found' });
    }

    // 生成路书码：FIKA-WF + 3位随机数字，确保不重复
    let roadCode = '';
    let exists = true;
    while (exists) {
      const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      roadCode = `FIKA-WF${rand}`;
      const existingClient = await db.collection('fika_clients').findOne({ roadCode });
      exists = !!existingClient;
    }

    // 创建新客户
    const newClient = {
      id: `client-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: survey.name,
      roadCode,
      coachCode: String(coachCode).toUpperCase(),
      tier: tier || 'standard',
      gender: 'male',
      age: 0,
      height: height ? Number(height) : 0,
      weight: weight ? Number(weight) : 0,
      bodyFat: bf_pct ? Number(bf_pct) : null,
      rhr: rhr ? Number(rhr) : null,
      goal: '',
      injury: '',
      weeklyData: [],
      start_date: new Date().toISOString(),
      current_week: 1,
      blocks: [],
      published_blocks: [],
      plan_draft_version: 0,
      plan_published_version: 0,
      plan_updated_at: '',
      plan_published_at: '',
      sessions: [],
      profile: survey.profile || {},
      bodyMetrics: {
        bf_pct: bf_pct ? Number(bf_pct) : undefined,
        rhr: rhr ? Number(rhr) : undefined,
      },
    };

    // 保存到 fika_clients
    const clientResult = await db.collection('fika_clients').insertOne(newClient);

    // 更新问卷状态为已审核
    await surveyPending.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { status: 'approved', approvedAt: new Date() } }
    );

    res.json({
      clientId: newClient.id,
      roadCode,
      name: newClient.name,
      tier: newClient.tier,
    });
  } catch (err) {
    console.error('[survey] approve failed', err);
    res.status(500).json({ error: 'approve failed', details: String(err) });
  }
});

const port = Number(process.env.PORT || 4000);

async function bootstrap() {
  try {
    await connectMongo();
    console.log('[backend] MongoDB connected successfully');
  } catch (err) {
    console.error('[backend] CRITICAL: MongoDB connection failed:', err.message);
    console.error('[backend] Application cannot start without MongoDB. Please check:');
    console.error('1. MongoDB is running: sudo systemctl status mongod');
    console.error('2. Connection string is correct in .env file');
    console.error('3. Network connectivity to MongoDB server');
    process.exit(1);
  }
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`[backend] FiKA SaaS Backend is running on http://0.0.0.0:${port}`);
    console.log('[backend] All data operations will use MongoDB exclusively');
  });
}

void bootstrap();
