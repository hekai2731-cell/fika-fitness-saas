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

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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

// Client data sync APIs - 强制使用MongoDB
app.get('/api/clients', async (req, res) => {
  try {
    const { coachId, tempUserId } = req.query;
    
    if (!coachId && !tempUserId) {
      return res.status(400).json({ error: 'coachId or tempUserId required' });
    }
    
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

app.post('/api/clients', async (req, res) => {
  try {
    const clientData = req.body;
    
    // 使用 findOneAndUpdate 配合 upsert: true
    const client = await Client.findOneAndUpdate(
      { 
        $or: [
          { id: clientData.id }, 
          { roadCode: clientData.roadCode }
        ]
      },
      { 
        ...clientData, 
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
    
    const client = await Client.findOneAndUpdate(
      { id: id },
      { ...clientData, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    
    console.log('[backend] Client updated in MongoDB:', id);
    res.json({ success: true, id: client.id });
  } catch (err) {
    console.error('[backend] MongoDB update failed:', err);
    res.status(500).json({ error: 'MongoDB connection failed', details: String(err) });
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
