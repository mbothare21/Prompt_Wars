import mongoose, { Schema } from "mongoose";
import { connectSessionDb } from "../lib/sessionDb";

const SessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  email:     { type: String, sparse: true },
  data:      { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ email: 1 }, { sparse: true });

let _model: mongoose.Model<{
  sessionId: string;
  email?: string;
  data: unknown;
  expiresAt: Date;
}> | null = null;

export async function getSessionModel() {
  if (_model) return _model;
  const conn = await connectSessionDb();
  if (!conn) return null;
  _model = conn.models["Session"] ?? conn.model("Session", SessionSchema);
  return _model;
}
