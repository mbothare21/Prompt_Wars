# Prompt Wars - Escape Room

An AI prompt engineering challenge built as a timed escape room game. Players navigate through 5 sequential rounds (+ 1 bonus) testing different prompt engineering skills, competing on speed, accuracy, and efficiency.

## Tech Stack

- **Framework:** Next.js 16.2.1 (App Router)
- **Frontend:** React 19.2.4, Tailwind CSS 4
- **Backend:** Next.js API Routes
- **Database:** MongoDB (Mongoose) for persistent player records
- **Session Store:** In-memory Map (active games) + Redis (email-session binding for resume)
- **AI Evaluation:** OpenAI API (for scoring prompt quality)
- **Language:** TypeScript 5

## Project Structure

```
.
├── client/
│   ├── app/
│   │   ├── api/
│   │   │   ├── start-game/route.ts    # Initialize new game session
│   │   │   ├── get-round/route.ts     # Fetch current round data
│   │   │   ├── evaluate/route.ts      # Evaluate player submissions
│   │   │   ├── penalty/route.ts       # Handle violations (tab switch, copy-paste)
│   │   │   └── leaderboard/route.ts   # Fetch ranked leaderboard
│   │   ├── components/
│   │   │   └── GameUI.tsx             # Main game UI (all phases)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── types.ts                   # Shared TypeScript types
│   │   ├── gameStore.ts               # In-memory session store
│   │   ├── playerStore.ts             # In-memory completed player store
│   │   ├── generateRounds.ts          # Round definitions and content
│   │   ├── evaluator.ts              # AI-powered round evaluation logic
│   │   ├── leaderboard.ts            # Leaderboard data aggregation
│   │   ├── ranking.ts                # Player ranking algorithm
│   │   ├── redis.ts                  # Redis client for session binding
│   │   └── time.ts                   # Time utility helpers
│   └── .env.example
├── server/
│   ├── lib/
│   │   └── mongodb.ts                # MongoDB connection (Mongoose)
│   └── models/
│       └── Player.ts                 # Player schema (rounds, scores, status)
└── package.json
```

## Game Flow

```
Splash Screen (image + "Enter Facility")
    │
    ▼
Welcome Page (mission briefing, objectives)
    │
    ▼
Instructions Page (rules, regulations, penalties)
    │
    ▼
Register Page (name + email input)
    │
    ▼
Game Begins (10-minute global timer starts)
    │
    ├── Round 1 → Round 2 → Round 3 → Round 4 → Round 5
    │                                                │
    │                                                ▼
    │                                          Bonus Round (if completed in time)
    │
    ▼
Finished Screen (debriefing report + leaderboard)
```

## Rounds

| Round | Type | Challenge | Pass Threshold | Attempts |
|-------|------|-----------|---------------|----------|
| 1 | CLASSIFY (MCQ) | Identify 4 prompt engineering techniques | 100% (all 4 correct) | Unlimited |
| 2 | IMPROVE | Improve a weak prompt to produce structured output | 70% | Unlimited |
| 3 | REVERSE | Write a prompt that would generate a given structured output | 65% | Unlimited |
| 4 | OPTIMIZE | Write the shortest prompt (<=15 words) using an analogy | 60% | 3 |
| 5 | STRUCTURED | Design a step-by-step structured reasoning prompt | 60% | 2 |
| 6 | BONUS | Meta-prompting: write a prompt that generates a better prompt | 60% | 1 |

## Timer

- **Duration:** 10 minutes for the entire game (all rounds combined)
- Starts when the player clicks "Initialize Sequence" on the registration page
- Runs continuously across all rounds — there are no per-round timers
- Displayed in the game header during `playing` and `bonus` phases
- On refresh, the timer resumes from the server-side session (not reset)

## Anti-Cheat System

### Tab Switching
- Detected via the `visibilitychange` event during `playing` and `bonus` phases
- Each violation deducts **15 seconds** from the remaining time
- After **3 violations**, the player is **disqualified**
- Disqualified players' scores and round data are still saved to the database and displayed on the leaderboard

### Copy-Paste
- Copy-paste actions are detected and penalized the same way as tab switching

### Session Persistence
- If a player refreshes, they are redirected back to their current game phase via localStorage
- The server session retains the timer, round progress, and attempt counts
- Each email can only play once — re-registration with the same email shows "Already played"

## Game Status

Each player's final outcome is recorded as one of:

| Status | Trigger |
|--------|---------|
| `COMPLETED` | Cleared all 5 main rounds |
| `COMPLETED_WITH_BONUS` | Cleared all 5 rounds + bonus round (6 rounds played) |
| `FAILED` | Attempts exhausted on a round (rounds 4-5) |
| `TIME_OVER` | 10-minute timer ran out |
| `DISQUALIFIED` | 3 tab-switch/copy-paste violations |

## Leaderboard

### Ranking Criteria (in priority order)
1. **Rounds Completed** (descending) — more rounds = higher rank
2. **Combined Score** (lower is better) — normalized time minus average accuracy
3. **Average Attempts Per Round** (ascending) — fewer attempts = higher rank
4. **Average Accuracy** (descending) — tiebreaker

### Visibility
- **Players** see the leaderboard (with their rank highlighted) on the finished screen after their game ends
- **Admin** sees the leaderboard with an additional **Game Status** column showing the outcome for each player

## Admin Access

Login with the hardcoded credentials on the registration page:
- **Name:** `admin`
- **Email:** `admin@prompt.com`

Admin view provides:
- **Round Preview:** View all round content without playing
- **Leaderboard:** Full player roster with game status, scores, attempts, and duration

## Data Persistence

### In-Memory (active sessions)
- `gameStore.ts` — active `GameSession` objects (Map)
- `playerStore.ts` — completed `Player` records (array)
- Lost on server restart

### MongoDB (permanent records)
- **Database:** `prompt-wars`
- **Collection:** `players`
- Player document created on game start (`$setOnInsert` via upsert)
- Round data pushed (`$push` to `rounds` array) after each evaluation
- Summary fields updated (`$set`) on any game-over event (completion, time-up, disqualification, failure)

### Player Schema (MongoDB)
```
{
  name: String,
  email: String (unique),
  roundsPlayed: Number,
  timeTaken: Number (milliseconds),
  avgAccuracy: Number,
  attemptsTaken: Number,
  gameStatus: "COMPLETED" | "COMPLETED_WITH_BONUS" | "FAILED" | "TIME_OVER" | "DISQUALIFIED",
  rounds: [{
    round: Number,
    attempts: Number,
    score: Number,
    prompt: Mixed (string or object),
    output: String
  }],
  createdAt: Date,
  completedAt: Date
}
```

## Environment Variables

Create a `.env` file in the `client/` directory (see `.env.example`):

```env
# Required: OpenAI API key for AI-powered evaluation
OPENAI_API_KEY=sk-...

# Required: MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/prompt-wars

# Optional: Redis URL for email-session resume. Omit to disable.
REDIS_URL=redis://localhost:6379
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB instance (local or Atlas)
- OpenAI API key
- Redis (optional, for session resume)

### Installation

```bash
# Install dependencies (from the project root)
npm install

# Set up environment variables
cp client/.env.example client/.env
# Edit client/.env with your keys

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play the game.

### Running Tests

```bash
npm test           # Single run
npm run test:watch # Watch mode
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/start-game` | Start a new game session (body: `{ name, email }`) |
| POST | `/api/get-round` | Get current round data (body: `{ sessionId }`) |
| POST | `/api/evaluate` | Submit and evaluate a round (body: `{ sessionId, prompt/answers }`) |
| POST | `/api/penalty` | Report a violation (body: `{ sessionId, violationType }`) |
| GET | `/api/leaderboard` | Get ranked leaderboard |
