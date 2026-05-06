from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel

GameStatus = Literal[
    "IN_PROGRESS", "COMPLETED", "COMPLETED_WITH_BONUS",
    "FAILED", "TIME_OVER", "DISQUALIFIED"
]


class PromptPart(BaseModel):
    id: str
    text: str
    options: List[str]
    answer: str


class Round(BaseModel):
    roundNumber: int
    type: Optional[Literal[
        "IMPROVE", "REVERSE", "OPTIMIZE", "STRUCTURED",
        "CONSTRAINT_MASTER", "BONUS", "CLASSIFY"
    ]] = None
    instruction: Optional[str] = None
    originalPrompt: Optional[str] = None
    input: Optional[str] = None
    referenceExample: Optional[str] = None
    challenge: Optional[str] = None
    expectedOutput: Optional[str] = None
    expectedAnswer: Optional[str] = None
    status: Optional[str] = None
    constraints: Optional[Any] = None
    promptParts: Optional[List[PromptPart]] = None
    basePrompt: Optional[str] = None


class Player(BaseModel):
    playerId: str
    name: str
    email: Optional[str] = None
    startedAt: int
    completedAt: Optional[int] = None
    roundsPlayed: int
    totalScore: float
    averageScore: float
    completed: bool
    attempts: Optional[int] = None
    totalAttempts: Optional[int] = None
    attemptsPerRound: Optional[Dict[str, int]] = None
    timeLimit: Optional[int] = None
    gameStatus: Optional[GameStatus] = None


class PendingRound(BaseModel):
    round: int
    attempts: int
    score: float
    prompt: Any
    output: str


class GameSession(BaseModel):
    sessionId: str
    player: Player
    currentRound: int
    rounds: List[Round]
    startTime: int
    timeLimit: int
    completed: bool
    status: Literal["ACTIVE", "COMPLETED", "FAILED", "TIME_UP", "DISQUALIFIED"]
    attemptsPerRound: Dict[str, int]
    maxAttemptsPerRound: int
    scores: List[float]
    bonusUnlocked: bool
    bonusAttempted: Optional[bool] = None
    bonusSubmittedAt: Optional[int] = None
    violations: int
    penaltyTimeSec: int
    pendingRounds: Optional[List[PendingRound]] = None


class StoredGameSession(BaseModel):
    sessionId: str
    player: Player
    currentRound: int
    startTime: int
    timeLimit: int
    completed: bool
    status: Literal["ACTIVE", "COMPLETED", "FAILED", "TIME_UP", "DISQUALIFIED"]
    attemptsPerRound: Dict[str, int]
    maxAttemptsPerRound: int
    scores: List[float]
    bonusUnlocked: bool
    bonusAttempted: Optional[bool] = None
    bonusSubmittedAt: Optional[int] = None
    violations: int
    penaltyTimeSec: int
    pendingRounds: Optional[List[PendingRound]] = None
