import mongoose from 'mongoose';

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/fika';

let isConnected = false;

export async function connectMongo() {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

  await mongoose.connect(mongoUri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = true;
  console.log(`[backend] MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
}
