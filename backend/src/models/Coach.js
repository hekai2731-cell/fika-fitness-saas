import mongoose from 'mongoose';

const coachSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    specialties: [String],
  },
  { timestamps: true }
);

export const Coach = mongoose.model('Coach', coachSchema);
