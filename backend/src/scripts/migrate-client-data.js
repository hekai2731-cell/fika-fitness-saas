/**
 * 数据迁移脚本：从旧的 Client 文档里抽出 blocks/sessions 到新的独立 Collection
 * 运行方式：node --experimental-vm-modules src/scripts/migrate-client-data.js
 * 迁移完成后旧字段不会立即删除，确认无误后再手动清理
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { Client } from '../models/Client.js';
import { TrainingPlan } from '../models/TrainingPlan.js';
import { Session } from '../models/Session.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fika';

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);

  const clients = await Client.collection.find({}).toArray();
  console.log(`📋 Found ${clients.length} clients to process`);

  let plansMigrated = 0;
  let sessionsMigrated = 0;
  let skipped = 0;

  for (const client of clients) {
    const clientId = client.id;
    if (!clientId) { skipped++; continue; }

    // ── 迁移训练规划 (blocks) ──────────────────────────────────
    const blocks = Array.isArray(client.blocks) ? client.blocks : [];
    const publishedBlocks = Array.isArray(client.published_blocks) ? client.published_blocks : [];

    if (blocks.length > 0 || publishedBlocks.length > 0) {
      const existingPlan = await TrainingPlan.findOne({ clientId });
      if (!existingPlan) {
        await TrainingPlan.create({
          clientId,
          coachCode: client.coachCode || '',
          status: client.plan_draft_status || 'draft',
          draft_version: client.plan_draft_version || 1,
          published_version: client.plan_published_version || 0,
          published_at: client.plan_published_at || null,
          updated_at: client.plan_updated_at || client.updatedAt || null,
          blocks,
          published_blocks: publishedBlocks,
          publish_history: Array.isArray(client.plan_publish_history)
            ? client.plan_publish_history.map(h => ({
                version: h.version,
                published_at: h.published_at,
                published_by: h.published_by || {},
                summary: h.summary || {
                  block_count: Array.isArray(h.blocks) ? h.blocks.length : 0,
                  week_count: 0,
                  day_count: 0,
                },
              }))
            : [],
        });
        plansMigrated++;
        console.log(`  📦 Plan migrated for client: ${clientId} (${client.name})`);
      } else {
        console.log(`  ⏭  Plan already exists for client: ${clientId}, skipping`);
      }
    }

    // ── 迁移上课记录 (sessions) ───────────────────────────────
    const sessions = Array.isArray(client.sessions) ? client.sessions : [];
    if (sessions.length > 0) {
      const existingCount = await Session.countDocuments({ clientId });
      if (existingCount === 0) {
        const sessionDocs = sessions.map(s => ({
          clientId,
          coachCode: client.coachCode || '',
          date: s.date ? new Date(s.date) : new Date(),
          week: s.week || null,
          day: s.day || null,
          duration: s.duration || null,
          price: s.price || null,
          level: s.level || null,
          rpe: s.rpe || null,
          performance: s.performance || '',
          note: s.note || '',
          hrAvg: s.hrAvg || null,
          hrMax: s.hrMax || null,
          hrMin: s.hrMin || null,
          hrZoneDurations: s.hrZoneDurations || null,
          kcal: s.kcal || s.calories || null,
          exercises: Array.isArray(s.exercises) ? s.exercises : [],
        }));
        await Session.insertMany(sessionDocs, { ordered: false });
        sessionsMigrated += sessionDocs.length;
        console.log(`  🏃 ${sessionDocs.length} sessions migrated for client: ${clientId} (${client.name})`);
      } else {
        console.log(`  ⏭  Sessions already exist for client: ${clientId} (${existingCount} records), skipping`);
      }
    }
  }

  console.log('\n✅ Migration complete:');
  console.log(`   Plans migrated:    ${plansMigrated}`);
  console.log(`   Sessions migrated: ${sessionsMigrated}`);
  console.log(`   Clients skipped:   ${skipped}`);
  console.log('\n⚠️  旧字段 (blocks, sessions, plan_*) 保留在 Client 文档中，确认迁移正确后可手动清理');

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
