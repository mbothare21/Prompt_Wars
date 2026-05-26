import mongoose from "mongoose";

type SessionDbCache = {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
};

const globalWithSessionDb = globalThis as typeof globalThis & {
  sessionDb?: SessionDbCache;
};

let cached = globalWithSessionDb.sessionDb;
if (!cached) {
  cached = globalWithSessionDb.sessionDb = { conn: null, promise: null };
}

function getSessionDbUri(): string | null {
  const base = (process.env.MONGO_URI ?? process.env.MONGODB_URI ?? "").trim();
  if (!base) return null;
  // Replace the database name in the URI with "gameSessions"
  // mongodb+srv://user:pass@cluster.net/dbname?opts  →  .../gameSessions?opts
  return base.replace(/(mongodb(?:\+srv)?:\/\/[^/]+\/)([^?]*)(\??.*$)/, "$1gameSessions$3");
}

export async function connectSessionDb(): Promise<mongoose.Connection | null> {
  const uri = getSessionDbUri();
  if (!uri) return null;

  if (cached!.conn) return cached!.conn;

  if (!cached!.promise) {
    cached!.promise = mongoose
      .createConnection(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 30000,
      })
      .asPromise();
  }

  cached!.conn = await cached!.promise;
  return cached!.conn;
}
