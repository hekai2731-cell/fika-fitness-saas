import mongoose from 'mongoose';

const SystemConfigSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
  collection: 'fika_system_config',
});

export const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);
