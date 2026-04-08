import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const planSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    tempUserId: { type: String, index: true, default: 'guest' },
    clientId: { type: String, index: true },
    planType: {
      type: String,
      enum: ['session', 'week', 'full', 'diet'],
      required: true,
      index: true,
    },
    title: { type: String, trim: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: {} },
    source: {
      type: String,
      enum: ['ai', 'manual', 'imported'],
      default: 'ai',
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

planSchema.index({ userId: 1, createdAt: -1 });
planSchema.index({ tempUserId: 1, createdAt: -1 });
planSchema.index({ clientId: 1, createdAt: -1 });

export const Plan = model('Plan', planSchema);
