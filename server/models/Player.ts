import mongoose, { Schema } from "mongoose";

const RoundSchema = new Schema({
  round: Number,
  attempts: Number,
  score: Number,

  prompt: Schema.Types.Mixed, // supports string OR object
  output: String,
});

const PlayerSchema = new Schema({
  name: String,
  email: { type: String, unique: true },

  roundsPlayed: Number,
  timeTaken: Number,
  avgAccuracy: Number,
  attemptsTaken: Number,

  gameStatus: {
    type: String,
    enum: [
      "IN_PROGRESS",
      "COMPLETED",
      "COMPLETED_WITH_BONUS",
      "FAILED",
      "TIME_OVER",
      "DISQUALIFIED",
    ],
    default: "IN_PROGRESS",
  },

  rounds: [RoundSchema],
  lastActivityAt: Date,

  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

PlayerSchema.index({ email: 1, createdAt: 1 });
PlayerSchema.index({ roundsPlayed: -1, avgAccuracy: -1 });

export default mongoose.models.Player ||
  mongoose.model("Player", PlayerSchema);
