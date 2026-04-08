import mongoose from 'mongoose';

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/fika';

export async function connectMongo() {
  // 检查现有连接状态
  if (mongoose.connection.readyState === 1) {
    console.log('[backend] MongoDB already connected');
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

  // 优化的连接配置
  await mongoose.connect(mongoUri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 10000, // 增加超时时间
    socketTimeoutMS: 45000, // socket超时
    bufferMaxEntries: 0, // 禁用缓冲
    bufferCommands: false, // 禁用命令缓冲
    maxPoolSize: 10, // 连接池大小
    minPoolSize: 2, // 最小连接数
    maxIdleTimeMS: 30000, // 最大空闲时间
    heartbeatFrequencyMS: 10000, // 心跳频率
    retryWrites: true, // 重试写入
    w: 'majority', // 写入确认
  });

  // 连接事件监听
  mongoose.connection.on('connected', () => {
    console.log(`[backend] MongoDB connected: ${mongoose.connection.name}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[backend] MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[backend] MongoDB disconnected');
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('[backend] MongoDB connection closed through app termination');
    process.exit(0);
  });

  return mongoose.connection;
}
