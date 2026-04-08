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

// 内存存储（MongoDB不可用时的回退方案）
let memoryClients = [];

// Client data sync APIs
app.get('/api/clients', async (req, res) => {
  try {
    const { coachId, tempUserId } = req.query;
    
    if (!coachId && !tempUserId) {
      return res.status(400).json({ error: 'coachId or tempUserId required' });
    }
    
    let clients;
    
    // 尝试从MongoDB获取
    try {
      let query = {};
      if (coachId) query.coachCode = String(coachId);
      if (tempUserId) query.tempUserId = String(tempUserId);
      
      clients = await Client.find(query).lean();
    } catch (dbErr) {
      // 回退到内存存储
      console.log('[backend] Using memory storage for clients');
      clients = memoryClients.filter(client => {
        if (coachId && client.coachCode !== String(coachId)) return false;
        if (tempUserId && client.tempUserId !== String(tempUserId)) return false;
        return true;
      });
    }
    
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'fetch clients failed', details: String(err) });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const clientData = req.body;
    
    // 尝试MongoDB存储
    try {
      // 检查是否已存在
      const existing = await Client.findOne({ 
        $or: [{ id: clientData.id }, { roadCode: clientData.roadCode }] 
      });
      
      if (existing) {
        return res.status(409).json({ error: 'client already exists' });
      }
      
      const client = new Client(clientData);
      await client.save();
      
      console.log('[backend] Client created in MongoDB:', client.id);
      res.json({ success: true, id: client.id });
    } catch (dbErr) {
      // 回退到内存存储
      console.log('[backend] Using memory storage for client creation');
      
      const existing = memoryClients.find(c => 
        c.id === clientData.id || c.roadCode === clientData.roadCode
      );
      
      if (existing) {
        return res.status(409).json({ error: 'client already exists' });
      }
      
      memoryClients.push({ ...clientData, createdAt: new Date(), updatedAt: new Date() });
      console.log('[backend] Client created in memory:', clientData.id);
      res.json({ success: true, id: clientData.id });
    }
  } catch (err) {
    res.status(500).json({ error: 'save client failed', details: String(err) });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientData = req.body;
    
    // 尝试MongoDB更新
    try {
      const client = await Client.findOneAndUpdate(
        { id: id },
        { ...clientData, updatedAt: new Date() },
        { new: true, upsert: true }
      );
      
      console.log('[backend] Client updated in MongoDB:', id);
      res.json({ success: true, id: client.id });
    } catch (dbErr) {
      // 回退到内存存储
      console.log('[backend] Using memory storage for client update');
      
      const index = memoryClients.findIndex(c => c.id === id);
      if (index >= 0) {
        memoryClients[index] = { ...memoryClients[index], ...clientData, updatedAt: new Date() };
      } else {
        memoryClients.push({ ...clientData, id, createdAt: new Date(), updatedAt: new Date() });
      }
      
      console.log('[backend] Client updated in memory:', id);
      res.json({ success: true, id });
    }
  } catch (err) {
    res.status(500).json({ error: 'update client failed', details: String(err) });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deletedByCoachCode, deletedByCoachName } = req.body;
    
    // 尝试MongoDB软删除
    try {
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
    } catch (dbErr) {
      // 回退到内存存储（硬删除）
      console.log('[backend] Using memory storage for client deletion');
      
      const index = memoryClients.findIndex(c => c.id === id);
      if (index < 0) {
        return res.status(404).json({ error: 'client not found' });
      }
      
      memoryClients.splice(index, 1);
      console.log('[backend] Client deleted from memory:', id);
      res.json({ success: true, id });
    }
  } catch (err) {
    res.status(500).json({ error: 'delete client failed', details: String(err) });
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
    const saved = await persistGeneratedPlan('week', payload, plan);
    res.json({ ...plan, planId: saved._id });
  } catch (err) {
    res.status(500).json({ error: 'week plan failed', details: String(err) });
  }
});

app.post('/api/full-plan', async (req, res) => {
  try {
    const payload = req.body || {};
    const plan = await generateFullPlan(payload);
    if (plan?.error) return res.status(500).json(plan);
    const saved = await persistGeneratedPlan('full', payload, plan);
    res.json({ ...plan, planId: saved._id });
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
    console.error('[backend] failed to connect MongoDB, starting without database:', err.message);
    console.log('[backend] AI functions will work, but data persistence is disabled');
  }
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`[backend] AI Brain is running on http://0.0.0.0:${port}`);
  });
}

void bootstrap();
