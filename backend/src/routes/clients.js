import { Router } from 'express';
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fika';
const DB_NAME = 'fika';
const CLIENTS_COLLECTION = 'fika_clients';

let db = null;
let connecting = false;

async function getDb() {
  if (db) return db;
  if (connecting) {
    await new Promise(r => setTimeout(r, 200));
    return getDb();
  }
  connecting = true;
  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(DB_NAME);
    console.log('[MongoDB] 连接成功:', MONGO_URI);
    await db.collection(CLIENTS_COLLECTION).createIndex({ id: 1 }, { unique: true });
    await db.collection(CLIENTS_COLLECTION).createIndex({ roadCode: 1 });
    await db.collection(CLIENTS_COLLECTION).createIndex({ coachCode: 1 });
    return db;
  } finally {
    connecting = false;
  }
}

async function col() {
  const database = await getDb();
  return database.collection(CLIENTS_COLLECTION);
}

const router = Router();

router.get('/', async (req, res) => {
  try {
    const c = await col();
    const filter = {};
    if (req.query.coachCode) filter.coachCode = req.query.coachCode;
    const clients = await c.find(filter, { projection: { _id: 0 } }).toArray();
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/by-road-code/:code', async (req, res) => {
  try {
    const c = await col();
    const client = await c.findOne(
      { roadCode: req.params.code.toUpperCase() },
      { projection: { _id: 0 } }
    );
    if (!client) return res.status(404).json({ error: 'not found' });
    res.json(client);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await col();
    const client = await c.findOne({ id: req.params.id }, { projection: { _id: 0 } });
    if (!client) return res.status(404).json({ error: 'not found' });
    res.json(client);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const c = await col();
    const data = { ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    await c.replaceOne({ id: req.params.id }, data, { upsert: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const c = await col();
    const clients = req.body;
    if (!Array.isArray(clients) || clients.length === 0)
      return res.status(400).json({ error: 'need array' });
    const ops = clients.map(client => ({
      replaceOne: {
        filter: { id: client.id },
        replacement: { ...client, updatedAt: new Date().toISOString() },
        upsert: true,
      },
    }));
    await c.bulkWrite(ops);
    res.json({ ok: true, count: clients.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const c = await col();
    await c.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
