import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mongoose, { isValidObjectId } from 'mongoose';
import { generateSessionPlan } from './sessionPlan.js';
import { generateWeekPlan, generateFullPlan } from './planning.js';
import { generateDietPlan } from './dietPlan.js';
import { generateProgressReport } from './progressReport.js';
import { connectMongo } from './db/mongoose.js';
import { Plan } from './models/Plan.js';
import { Client } from './models/Client.js';
import { Coach } from './models/Coach.js';
import clientsRouter from './routes/clients.js';
import plansRouter from './routes/plans.js';
import aiRouter from './routes/ai.js';
import sessionsRouter from './routes/sessions.js';
import financesRouter from './routes/finances.js';
import adminRouter from './routes/admin.js';
import coachRulesRouter from './routes/coachRules.js';
import { recommendBlock, generateWeekFramework } from './blockPlanner.js';
import { blockNames, weekThemes, dayStyles, GOAL_KEY_MAP, DIR_KEY_MAP, distributeWeekdays, generatePlanNames } from './planNaming.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 路由挂载
app.use('/api/sync/clients', clientsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/ai', aiRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/finances', financesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/coach-rules', coachRulesRouter);

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
  const mongoConnected = mongoose.connection.readyState === 1;
  res.json({ ok: true, service: 'fika-backend', mongoConnected, ts: Date.now() });
});

// 调试API（已迁移到 routes/admin.js）- 保留此注释用于记录迁移历史
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

// 数据清理API（已迁移到 routes/admin.js）
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

    // 检查是否存在同 id 或同 roadCode 的已软删记录，防止复活
    const existing = await Client.collection.findOne({
      $or: [
        { id: clientData.id },
        { roadCode: clientData.roadCode },
      ],
    });
    if (existing && existing.deletedAt) {
      return res.status(409).json({
        error: 'Client has been deleted',
        code: 'CLIENT_DELETED',
        details: `A client with this id or roadCode was soft-deleted and cannot be recreated`,
      });
    }

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

    // 直接走 MongoDB driver 绕过 Mongoose pre find 软删过滤，查原始记录
    const existing = await Client.collection.findOne({ id });

    // 如果客户已被软删除，拒绝更新（防止 upsert 复活）
    if (existing && existing.deletedAt) {
      return res.status(409).json({
        error: 'Client has been deleted',
        code: 'CLIENT_DELETED',
        details: `Client ${id} was soft-deleted and cannot be updated`,
      });
    }

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

app.post('/api/clients/:id/plan/review-ready', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findOneAndUpdate(
      { id },
      {
        plan_draft_status: 'review_ready',
        updatedAt: new Date(),
      },
      { new: true }
    ).lean();

    if (!client) {
      return res.status(404).json({ error: 'client not found' });
    }

    return res.json({ success: true, client });
  } catch (err) {
    console.error('[backend] mark review-ready failed:', err);
    return res.status(500).json({ error: 'mark review-ready failed', details: String(err) });
  }
});

app.post('/api/clients/:id/plan/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      publishedByCoachCode,
      publishedByCoachName,
      selectedWeekNum,
      selectedDay,
      selectedDayId,
      selectedBlockId,
    } = req.body || {};

    const client = await Client.findOne({ id });
    if (!client) {
      return res.status(404).json({ error: 'client not found' });
    }

    const blocks = Array.isArray(client.blocks) ? client.blocks : [];
    if (blocks.length === 0) {
      return res.status(400).json({ error: 'no draft blocks to publish' });
    }

    const publishedAt = new Date();
    const draftVersion = Number(client.plan_draft_version || 1);
    const nextHistory = Array.isArray(client.plan_publish_history) ? [...client.plan_publish_history] : [];
    // history 只存摘要，不存完整 blocks，防止文档无限增大
    nextHistory.push({
      version: draftVersion,
      published_at: publishedAt,
      published_by: {
        coachCode: publishedByCoachCode || null,
        coachName: publishedByCoachName || null,
      },
      summary: {
        block_count: blocks.length,
        week_count: blocks.reduce((s, b) => s + (Array.isArray(b.training_weeks) ? b.training_weeks.length : 0), 0),
        day_count: blocks.reduce((s, b) => s + (Array.isArray(b.training_weeks) ? b.training_weeks.reduce((ws, w) => ws + (Array.isArray(w.days) ? w.days.length : 0), 0) : 0), 0),
      },
    });

    client.published_blocks = JSON.parse(JSON.stringify(blocks));
    client.plan_draft_status = 'published';
    client.plan_published_version = draftVersion;
    client.plan_published_at = publishedAt;
    client.plan_publish_history = nextHistory;

    const firstBlock = blocks[0] || null;
    const firstWeek = Array.isArray(firstBlock?.training_weeks) ? firstBlock.training_weeks[0] : null;
    const firstDay = Array.isArray(firstWeek?.days) ? firstWeek.days[0] : null;

    client.current_week = Number(selectedWeekNum || client.current_week || firstWeek?.week_num || 1);
    client.current_day = String(selectedDay || client.current_day || firstDay?.day || '');
    client.current_day_id = String(selectedDayId || client.current_day_id || firstDay?.id || '');
    client.current_block_id = String(selectedBlockId || client.current_block_id || firstBlock?.id || '');

    client.updatedAt = publishedAt;
    await client.save();

    return res.json({ success: true, client: client.toObject() });
  } catch (err) {
    console.error('[backend] publish plan failed:', err);
    return res.status(500).json({ error: 'publish plan failed', details: String(err) });
  }
});

app.post('/api/clients/:id/plan/rollback', async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body || {};

    const client = await Client.findOne({ id });
    if (!client) {
      return res.status(404).json({ error: 'client not found' });
    }

    // history 现在只存摘要，回滚只能回到上一个已发布版本（published_blocks）
    const history = Array.isArray(client.plan_publish_history) ? client.plan_publish_history : [];
    if (history.length === 0 || !Array.isArray(client.published_blocks) || client.published_blocks.length === 0) {
      return res.status(400).json({ error: 'no published version to rollback to' });
    }

    // 找到目标版本的摘要记录（用于更新版本号和时间戳）
    const currentVersion = Number(client.plan_published_version || 0);
    let targetMeta = null;
    if (version != null) {
      targetMeta = history.find((item) => Number(item?.version) === Number(version)) || null;
    } else {
      const candidates = history.filter((item) => Number(item?.version) !== currentVersion);
      targetMeta = candidates[candidates.length - 1] || null;
    }

    if (!targetMeta) {
      return res.status(400).json({ error: 'rollback target version not found in history' });
    }

    // published_blocks 保持不变（已是最后发布的内容），只更新版本号标记
    client.plan_draft_status = 'published';
    client.plan_published_version = Number(targetMeta.version || 0);
    client.plan_published_at = targetMeta.published_at ? new Date(targetMeta.published_at) : new Date();
    client.updatedAt = new Date();
    await client.save();

    return res.json({ success: true, client: client.toObject() });
  } catch (err) {
    console.error('[backend] rollback plan failed:', err);
    return res.status(500).json({ error: 'rollback plan failed', details: String(err) });
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

app.post('/api/clients/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Client.collection.updateOne(
      { id },
      {
        $unset: {
          deletedAt: '',
          deletedByCoachCode: '',
          deletedByCoachName: '',
        },
        $set: { updatedAt: new Date() },
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ error: 'client not found' });
    }

    console.log('[backend] Client restored in MongoDB:', id);
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[backend] MongoDB restore failed:', err);
    return res.status(500).json({ error: 'MongoDB connection failed', details: String(err) });
  }
});

app.delete('/api/clients/:id/hard', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Client.collection.deleteOne({ id });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'client not found' });
    }

    console.log('[backend] Client hard deleted in MongoDB:', id);
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[backend] MongoDB hard delete failed:', err);
    return res.status(500).json({ error: 'MongoDB connection failed', details: String(err) });
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

    if (coaches.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    // 用 bulkWrite upsert 逐条更新，不做全量删除，避免中途崩溃导致数据清空
    const ops = coaches.map((coach) => ({
      updateOne: {
        filter: { code: coach.code },
        update: { $set: { ...coach, updatedAt: new Date() } },
        upsert: true,
      },
    }));

    const result = await Coach.bulkWrite(ops, { ordered: false });

    console.log('[backend] Coaches upserted:', result.upsertedCount, 'inserted,', result.modifiedCount, 'modified');
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

// POST /api/coaches — 单条教练 upsert
app.post('/api/coaches', async (req, res) => {
  try {
    const { code, name, specialties } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const doc = await Coach.findOneAndUpdate(
      { code: String(code).toUpperCase() },
      { $set: { code: String(code).toUpperCase(), name: String(name), specialties: specialties || [], updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ success: true, code: doc.code });
  } catch (err) {
    console.error('[backend] POST /api/coaches failed:', err);
    res.status(500).json({ error: 'Failed to add coach', details: String(err) });
  }
});

// AI 和 Plans API 已迁移到 routes/ai.js 和 routes/plans.js
// 旧端点向后兼容：/api/session-plan /api/week-plan /api/full-plan /api/diet-plan
// 前端逐步迁移到 /api/ai/generate 后可删除以下兼容层

app.post('/api/session-plan', async (req, res) => {
  try {
    const plan = await generateSessionPlan(req.body || {});
    res.json({ ...plan, planId: null });
  } catch (err) {
    res.status(500).json({ error: 'session plan failed', details: String(err) });
  }
});

app.post('/api/week-plan', async (req, res) => {
  try {
    const plan = await generateWeekPlan(req.body || {});
    if (plan?.error) return res.status(500).json(plan);
    res.json({ ...plan, planId: null });
  } catch (err) {
    res.status(500).json({ error: 'week plan failed', details: String(err) });
  }
});

app.post('/api/full-plan', async (req, res) => {
  try {
    const plan = await generateFullPlan(req.body || {});
    if (plan?.error) return res.status(500).json(plan);
    res.json({ ...plan, planId: null });
  } catch (err) {
    res.status(500).json({ error: 'full plan failed', details: String(err) });
  }
});

app.post('/api/diet-plan', async (req, res) => {
  try {
    const plan = await generateDietPlan(req.body || {});
    if (plan?.error) return res.status(500).json(plan);
    res.json({ ...plan, planId: null });
  } catch (err) {
    res.status(500).json({ error: 'diet plan failed', details: String(err) });
  }
});

app.post('/api/progress-report', async (req, res) => {
  try {
    const result = await generateProgressReport(req.body);
    res.json(result);
  } catch (e) {
    console.error('[progressReport]', e);
    res.status(500).json({ error: String(e?.message || '生成失败') });
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
    const { weight, height, bf_pct, rhr, tier, coachCode, goal, injury } = req.body;

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

    const normalizedGender = ['male', 'female', 'other'].includes(String(survey.gender || '').toLowerCase())
      ? String(survey.gender).toLowerCase()
      : 'other';

    // 创建新客户
    const newClient = {
      id: `client-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: survey.name,
      roadCode,
      coachCode: String(survey.coachCode || coachCode || '').toUpperCase(),
      tier: tier || 'standard',
      gender: normalizedGender,
      age: 0,
      height: height ? Number(height) : 0,
      weight: weight ? Number(weight) : 0,
      bodyFat: bf_pct ? Number(bf_pct) : null,
      rhr: rhr ? Number(rhr) : null,
      goal: goal ? String(goal).trim() : (survey.profile?.goal_type ? ({ fat_loss:'减脂塑形', muscle_gain:'增肌', performance:'提升体能', posture:'改善姿态', rehabilitation:'功能康复' }[survey.profile.goal_type] || '') : ''),
      injury: injury ? String(injury).trim() : '',
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

// ── 纯规则接口（不调用 AI，毫秒响应）────────────────────────────────────

// POST /api/plan/generate-framework — 规则生成 Block+Week+Day 框架
app.post('/api/plan/generate-framework', (req, res) => {
  try {
    const {
      goals = ['performance'],
      direction = 'balanced',
      weeklyFreq = 3,
      membershipLevel = 'standard',
      totalWeeks = 8,
    } = req.body || {};

    const level = ['standard', 'advanced', 'professional', 'elite'].includes(membershipLevel)
      ? membershipLevel : 'standard';

    const primaryGoal = Array.isArray(goals) ? goals[0] : goals;
    const goalKey = GOAL_KEY_MAP[primaryGoal] || 'performance';
    const dirKey  = DIR_KEY_MAP[String(direction)] || 'balanced';

    const block_name = blockNames[level]?.[goalKey] || `${level} Block`;
    const block_goal = block_name;

    const freq  = Math.max(1, Math.min(Number(weeklyFreq) || 3, 7));
    const count = Math.max(1, Math.min(Number(totalWeeks) || 8, 52));

    const { weeks } = generatePlanNames({ level, goalKey, dirKey, freq, totalWeeks: count });

    // 补充 week_title 兼容字段
    const weeksWithTitle = weeks.map(w => ({ ...w, week_title: w.week_theme }));

    res.json({ block_name, block_goal, weeks: weeksWithTitle });
  } catch (err) {
    res.status(500).json({ error: 'generate framework failed', details: String(err) });
  }
});

// POST /api/block/recommend — 根据客户数据推荐 Block 目标
app.post('/api/block/recommend', async (req, res) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    const client = await Client.findOne({ id: String(clientId) }).lean();
    if (!client) return res.status(404).json({ error: 'client not found' });
    const recommendation = recommendBlock(client);
    res.json(recommendation);
  } catch (err) {
    res.status(500).json({ error: 'block recommend failed', details: String(err) });
  }
});

// POST /api/week/framework — 自动生成 Week 节奏框架（不调用 AI）
app.post('/api/week/framework', (req, res) => {
  try {
    const { blockGoal = '', totalWeeks = 8 } = req.body || {};
    const weeks = generateWeekFramework(String(blockGoal), Number(totalWeeks));
    res.json({ weeks });
  } catch (err) {
    res.status(500).json({ error: 'week framework failed', details: String(err) });
  }
});

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '127.0.0.1';

async function connectMongoWithRetry() {
  try {
    await connectMongo();
    console.log('[backend] MongoDB connected successfully');
    return;
  } catch (err) {
    console.error('[backend] MongoDB connection failed on startup:', err.message);
    console.error('[backend] Server will continue to run and retry in 5 seconds. Please check:');
    console.error('1. MongoDB is running: sudo systemctl status mongod');
    console.error('2. Connection string is correct in .env file');
    console.error('3. Network connectivity to MongoDB server');
    setTimeout(() => {
      void connectMongoWithRetry();
    }, 5000);
  }
}

async function bootstrap() {
  app.listen(port, host, () => {
    console.log(`[backend] FiKA SaaS Backend is running on http://${host}:${port}`);
    console.log('[backend] All data operations will use MongoDB exclusively');
  });

  await connectMongoWithRetry();
}

void bootstrap();
