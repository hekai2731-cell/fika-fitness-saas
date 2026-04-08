import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    externalId: { type: String, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    role: { type: String, enum: ['coach', 'student', 'admin'], default: 'student', index: true },
    profile: {
      gender: String,
      age: Number,
      height: Number,
      weight: Number,
      goal: String,
      injury: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const User = model('User', userSchema);
