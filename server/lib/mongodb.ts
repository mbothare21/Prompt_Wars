import mongoose from "mongoose";

type MongoCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  mongoose?: MongoCache;
};

let cached = globalWithMongoose.mongoose;

if (!cached) {
  cached = globalWithMongoose.mongoose = { conn: null, promise: null };
}

function getMongoUri(): string | null {
  const uri = process.env.MONGO_URI?.trim() || process.env.MONGODB_URI?.trim();
  return uri && uri.length > 0 ? uri : null;
}

export const connectDB = async () => {
  const mongoUri = getMongoUri();

  if (!mongoUri) {
    console.warn("[mongodb] MONGO_URI/MONGODB_URI not set — skipping DB connection");
    return null;
  }

  if (cached!.conn) return cached!.conn;

  if (!cached!.promise) {
    cached!.promise = mongoose.connect(mongoUri, {
      // Serverless functions benefit from smaller pools to avoid connection bursts.
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    });
  }

  cached!.conn = await cached!.promise;
  return cached!.conn;
};
