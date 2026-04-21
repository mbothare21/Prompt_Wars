"use client";

import Image from "next/image";
import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ATTEMPT_LIMITS,
  MAIN_ROUNDS,
  PASS_ADVANCE_MS,
  SESSION_TIME_LIMIT_MS,
  SESSION_POLL_INTERVAL_MS,
  TOTAL_ROUNDS,
  getTargetScore,
} from "@/lib/gameConstants";
import { compareCompetitiveStanding } from "@/lib/ranking";
import type { PromptPart, Round } from "@/lib/types";

type GamePhase = "splash" | "admin-login" | "admin-view" | "welcome" | "instructions" | "register" | "playing" | "bonus" | "finished";

type RoundPayload = {
  status: string;
  roundNumber?: number;
  roundType?: string;
  instruction?: string | null;
  originalPrompt?: string | null;
  input?: string | null;
  expectedOutput?: string | null;
  constraints?: unknown;
  promptParts?: PromptPart[] | null;
  attemptsThisRound?: number;
  maxAttemptsThisRound?: number;
  remainingTime?: number;
  reason?: string;
  bonusUnlocked?: boolean;
  error?: string;
};

type RoundViewData = {
  type?: string;
  instruction?: string | null;
  originalPrompt?: string | null;
  input?: string | null;
  expectedOutput?: string | null;
  constraints?: unknown;
  promptParts?: PromptPart[] | null;
};

type LastResult = {
  score: number;
  passed: boolean;
  timeTaken: number;
  targetScore: number;
};

type AdminPlayer = {
  playerId: string;
  name: string;
  email?: string;
  roundsPlayed: number;
  timeTakenSec: number;
  averageScore: number;
  attemptsUsed: number;
  completed: boolean;
  gameStatus?: string;
  rounds?: {
    round: number;
    attempts: number;
    score: number;
    prompt: unknown;
    output: string;
  }[];
};

function formatTitle(type: string | undefined): string {
  if (!type) return "Challenge";
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

const GAME_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: "Completed", color: "text-green-400" },
  COMPLETED_WITH_BONUS: { label: "Completed + Bonus", color: "text-emerald-300" },
  COMPLETED_BONUS: { label: "Completed + Bonus", color: "text-emerald-300" },
  FAILED: { label: "Failed (Attempts)", color: "text-red-400" },
  TIME_OVER: { label: "Time Out", color: "text-amber-400" },
  DISQUALIFIED: { label: "Disqualified (Violations)", color: "text-red-500" },
};

type ConstraintsObj = {
  maxWords?: number;
  requiredSections?: string[];
  requireSteps?: boolean;
  mustInclude?: string[];
  mustExclude?: string[];
  requiredAccuracy?: number;
  [key: string]: unknown;
};

function formatConstraints(constraints: unknown): string[] {
  if (!constraints || typeof constraints !== "object") return ["No specific constraints."];
  const c = constraints as ConstraintsObj;
  const parts: string[] = [];

  if (typeof c.maxWords === "number") parts.push(`Max Words: ${c.maxWords}`);
  if (Array.isArray(c.requiredSections)) {
    parts.push(`Required Sections: ${c.requiredSections.join(", ")}`);
  }
  if (c.requireSteps === true) parts.push(`Must include step-by-step reasoning`);
  if (Array.isArray(c.mustInclude)) {
    parts.push(`Must Include: ${c.mustInclude.join(", ")}`);
  }
  if (Array.isArray(c.mustExclude)) {
    parts.push(`Must Exclude: ${c.mustExclude.join(", ")}`);
  }
  if (typeof c.requiredAccuracy === "number") {
    const formattedAccuracy =
      c.requiredAccuracy <= 1
        ? `${Math.round(c.requiredAccuracy * 100)}%`
        : `${c.requiredAccuracy}`;
    parts.push(`Required Accuracy: ${formattedAccuracy}`);
  }

  if (parts.length === 0) return ["No specific constraints."];
  return parts;
}

export default function GameUI() {
  const [phase, setPhase] = useState<GamePhase>("splash");
  const [player, setPlayer] = useState({ name: "", email: "" });
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Admin States
  const [adminTab, setAdminTab] = useState<"preview" | "leaderboard">("preview");
  const [adminRoundNumber, setAdminRoundNumber] = useState(1);
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayer[]>([]);
  const [currentAdminToken, setCurrentAdminToken] = useState<string | null>(null);

  // Auto-sort Leaderboard Data based on strict criteria
  const sortedAdminPlayers = useMemo(() => {
    return [...adminPlayers].sort((a, b) => {
      return compareCompetitiveStanding(
        {
          roundsPlayed: a.roundsPlayed,
          averageScore: a.averageScore,
          timeTakenMs: a.timeTakenSec * 1000,
          attempts: a.attemptsUsed,
          name: a.name,
        },
        {
          roundsPlayed: b.roundsPlayed,
          averageScore: b.averageScore,
          timeTakenMs: b.timeTakenSec * 1000,
          attempts: b.attemptsUsed,
          name: b.name,
        }
      );
    });
  }, [adminPlayers]);

  // Player States
  const [roundNumber, setRoundNumber] = useState(1);
  const [timeLeftSec, setTimeLeftSec] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(0);

  const [promptInput, setPromptInput] = useState("");
  const [metaPromptInput, setMetaPromptInput] = useState("");
  const [finalPromptInput, setFinalPromptInput] = useState("");
  const [violations, setViolations] = useState(0);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [isGeneratingMeta, setIsGeneratingMeta] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropdownSelections, setDropdownSelections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const [stats, setStats] = useState({
    roundsCompleted: 0,
    accuracies: [] as number[],
    bonusCompleted: false,
    lastFinalScore: null as number | null,
    highScoreBonus: false,
  });

  const [isRestored, setIsRestored] = useState(false);

  type LeaderboardEntry = {
    playerId: string;
    name: string;
    email?: string;
    roundsPlayed: number;
    startedAt: number;
    completedAt?: number;
    averageScore: number;
    timeLimit?: number;
  };
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [currentRoundData, setCurrentRoundData] = useState<RoundViewData | null>(null);
  const [adminPreviewRounds, setAdminPreviewRounds] = useState<Round[] | null>(null);

  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;

  const allowTimeUpRef = useRef(false);
  const roundWallStartedAtRef = useRef<number>(0);
  const initialSessionSecondsRef = useRef<number>(0);
  const passAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyRoundPayload = useCallback((data: RoundPayload) => {
    const max = data.maxAttemptsThisRound ?? 3;
    const used = data.attemptsThisRound ?? 0;

    startTransition(() => {
      if (typeof data.roundNumber === "number") {
        setRoundNumber(data.roundNumber);
      }
      if (typeof data.remainingTime === "number") {
        setTimeLeftSec(Math.max(0, Math.ceil(data.remainingTime / 1000)));
      }
      setCurrentRoundData({
        type: data.roundType,
        instruction: data.instruction,
        originalPrompt: data.originalPrompt,
        input: data.input,
        expectedOutput: data.expectedOutput,
        constraints: data.constraints,
        promptParts: data.promptParts,
      });
      if (max < 0) {
        setAttemptsRemaining(-1);
      } else {
        setAttemptsRemaining(Math.max(0, max - used));
      }
    });
  }, []);

  const refreshRound = useCallback(
    async (sid: string) => {
      const res = await fetch("/api/get-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });

      let data: RoundPayload & { sessionStatus?: string };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        throw new Error("Invalid response from get-round");
      }

      if (!res.ok) {
        throw new Error(data.error ?? `get-round failed (${res.status})`);
      }

      if (data.status === "GAME_OVER") {
        setMessage(
          data.reason === "TIME_UP"
            ? "Time is up."
            : data.reason === "ATTEMPTS_EXHAUSTED"
              ? "No attempts remaining."
              : "Game over."
        );
        setPhase("finished");
        return;
      }
      if (data.status === "DISQUALIFIED") {
        setMessage("Disqualified.");
        setPhase("finished");
        return;
      }
      if (data.status === "GAME_COMPLETED") {
        setStats((s) => ({
          ...s,
          bonusCompleted: Boolean(data.bonusUnlocked),
        }));
        setPhase("finished");
        return;
      }
      if (data.status === "ACTIVE") {
        applyRoundPayload(data);
        if (data.roundType === "BONUS" || (data.roundNumber ?? 1) > MAIN_ROUNDS) {
          setPhase("bonus");
        } else {
          setPhase("playing");
        }
        return;
      }

      throw new Error(data.error ?? `Unexpected get-round status: ${data.status}`);
    },
    [applyRoundPayload]
  );

  const syncRoundFromServer = useEffectEvent(() => {
    const sid = sessionRef.current;
    if (!sid || document.hidden) return;
    void refreshRound(sid);
  });

  const tickCountdown = useEffectEvent(() => {
    setTimeLeftSec((s) => Math.max(0, s - 1));
  });

  // ── localStorage: restore state on mount ──
  useEffect(() => {
    const saved = localStorage.getItem("escapeRoom_state");
    if (saved) {
      try {
        const s = JSON.parse(saved) as {
          phase?: GamePhase;
          player?: { name: string; email: string };
          sessionId?: string | null;
          roundNumber?: number;
          stats?: typeof stats;
          violations?: number;
          initialSessionSeconds?: number;
        };
        if (s.player) setPlayer(s.player);
        if (s.sessionId) setSessionId(s.sessionId);
        if (typeof s.roundNumber === "number") setRoundNumber(s.roundNumber);
        if (s.stats) setStats(s.stats);
        if (typeof s.violations === "number") setViolations(s.violations);
        if (typeof s.initialSessionSeconds === "number") {
          initialSessionSecondsRef.current = s.initialSessionSeconds;
        }

        const restoredPhase = s.phase;
        if (
          restoredPhase &&
          restoredPhase !== "admin-login" &&
          restoredPhase !== "admin-view"
        ) {
          setPhase(restoredPhase);
          // For active game phases, sync with server
          if (
            (restoredPhase === "playing" || restoredPhase === "bonus") &&
            s.sessionId
          ) {
            refreshRound(s.sessionId).catch(() => {
              setPhase("welcome");
              localStorage.removeItem("escapeRoom_state");
            });
          }
        }
      } catch {
        // corrupted data — ignore
      }
    }
    setIsRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── localStorage: persist state on changes ──
  useEffect(() => {
    if (!isRestored) return;
    // Don't persist admin phases
    if (phase === "admin-login" || phase === "admin-view") return;
    localStorage.setItem(
      "escapeRoom_state",
      JSON.stringify({
        phase,
        player,
        sessionId,
        roundNumber,
        stats,
        violations,
        initialSessionSeconds: initialSessionSecondsRef.current,
      })
    );
  }, [isRestored, phase, player, sessionId, roundNumber, stats, violations]);

  const finishGame = useCallback((note?: string) => {
    if (passAdvanceTimeoutRef.current) {
      clearTimeout(passAdvanceTimeoutRef.current);
      passAdvanceTimeoutRef.current = null;
    }
    if (note) setMessage(note);
    setPhase("finished");
  }, []);

  const reportViolation = useCallback(
    async (violationType: "TAB_SWITCH" | "COPY_PASTE") => {
      const sid = sessionRef.current;
      if (!sid) return;
      try {
        const res = await fetch("/api/penalty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, violationType }),
        });
        const data = await res.json();
        if (data.status === "DISQUALIFIED") {
          alert("DISQUALIFIED: 3 violations reached. You have been removed from the game.");
          finishGame("Disqualified due to violations.");
          return;
        }
        if (typeof data.remainingTime === "number") {
          setTimeLeftSec(Math.max(0, Math.ceil(data.remainingTime / 1000)));
        }
        setViolations(data.violations ?? 0);
        const label = violationType === "TAB_SWITCH" ? "Tab switching" : "Copy/Paste";
        alert(
          `\u26A0\uFE0F CRITICAL SECURITY OVERRIDE DETECTED.\n\n${label} is strictly prohibited. 15 seconds deducted from life support.\n\nViolations remaining before disqualification: ${data.violationsRemaining}`
        );
      } catch {
        // Fallback: apply penalty locally if API call fails
        setTimeLeftSec((prev) => Math.max(0, prev - 15));
      }
    },
    [finishGame]
  );

  // Fetch leaderboard when game finishes
  useEffect(() => {
    if (phase !== "finished") return;
    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.leaderboard)) {
          setLeaderboardData(data.leaderboard);
        }
      })
      .catch(() => { });
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" && phase !== "bonus") return;
    const id = window.setInterval(() => {
      tickCountdown();
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" && phase !== "bonus") return;
    const id = window.setInterval(() => {
      syncRoundFromServer();
    }, SESSION_POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" && phase !== "bonus") {
      allowTimeUpRef.current = false;
      return;
    }
    if (timeLeftSec > 0) {
      allowTimeUpRef.current = true;
      return;
    }
    if (timeLeftSec === 0 && allowTimeUpRef.current) {
      allowTimeUpRef.current = false;
      finishGame("Time is up.");
    }
  }, [timeLeftSec, phase, finishGame]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.hidden &&
        (phase === "playing" || phase === "bonus") &&
        sessionRef.current
      ) {
        void reportViolation("TAB_SWITCH");
        return;
      }

      if (!document.hidden && (phase === "playing" || phase === "bonus")) {
        syncRoundFromServer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [phase, reportViolation]);

  useEffect(() => {
    if (phase === "playing" || phase === "bonus") {
      roundWallStartedAtRef.current = Date.now();
    }
  }, [roundNumber, phase]);

  useEffect(() => {
    return () => {
      if (passAdvanceTimeoutRef.current) {
        clearTimeout(passAdvanceTimeoutRef.current);
      }
    };
  }, []);

  const loadAdminPlayers = async (token: string) => {
    try {
      const res = await fetch("/api/admin/export-leaderboard", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      let data: { players?: Record<string, unknown>[] };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError("Bad response loading players.");
        return;
      }

      if (!res.ok) {
        setError(`Failed to load players (${res.status}).`);
        return;
      }

      const mapped = (data.players ?? []).map((p, i) => ({
        playerId: (p._id as string) ?? String(i),
        name: (p.name as string) ?? "Unknown",
        email: p.email as string | undefined,
        roundsPlayed: (p.roundsPlayed as number) ?? 0,
        timeTakenSec: Math.round(
          ((p.timeTaken as number) ?? 0) > 10000
            ? ((p.timeTaken as number) ?? 0) / 1000
            : ((p.timeTaken as number) ?? 0)
        ),
        averageScore: (p.avgAccuracy as number) ?? 0,
        attemptsUsed: (p.attemptsTaken as number) ?? 0,
        completed:
          p.gameStatus === "COMPLETED" || p.gameStatus === "COMPLETED_WITH_BONUS",
        gameStatus: p.gameStatus as string | undefined,
      }));

      startTransition(() => {
        setAdminPlayers(mapped);
      });
    } catch {
      setError("Network error loading players.");
    }
  };

  useEffect(() => {
    if (phase !== "admin-view" || adminPreviewRounds) return;

    void import("@/lib/generateRounds")
      .then(({ generateRounds }) => {
        setAdminPreviewRounds(generateRounds());
      })
      .catch(() => {
        setError("Failed to load admin preview.");
      });
  }, [adminPreviewRounds, phase]);

  const startGame = async () => {
    if (!player.name.trim() || !player.email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    setError(null);
    setMessage(null);
    setLastResult(null);
    setBusy(true);
    allowTimeUpRef.current = false;

    if (
      player.name.trim().toLowerCase() === "admin" &&
      player.email.trim().toLowerCase() === "admin@prompt.com"
    ) {
      try {
        const adminRes = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: player.name.trim(), email: player.email.trim() }),
        });

        if (!adminRes.ok) {
          setError("Admin terminal access denied.");
          return;
        }

        const adminData = (await adminRes.json()) as { token?: string };
        if (!adminData.token) {
          setError("Admin terminal access denied.");
          return;
        }

        setCurrentAdminToken(adminData.token);
        setPhase("admin-view");
        setAdminTab("preview");
        void loadAdminPlayers(adminData.token);
        return;
      } catch {
        setError("Admin terminal access denied.");
        return;
      } finally {
        setBusy(false);
      }
    }

    try {
      const res = await fetch("/api/start-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: player.name.trim(),
          email: player.email.trim(),
        }),
      });

      let data: { status?: string; message?: string; sessionId?: string; timeLimit?: number; remainingTime?: number; error?: string; };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError("Terminal uplink failed.");
        return;
      }

      if (!res.ok) {
        setError(data.error ?? `Uplink failed (${res.status}).`);
        return;
      }
      if (data.status === "ALREADY_PLAYED") {
        setError(data.message ?? "You have already attempted the gauntlet.");
        return;
      }
      if (!data.sessionId) {
        setError(data.error ?? "Could not initialize sequence.");
        return;
      }

      const budgetMs = data.timeLimit ?? SESSION_TIME_LIMIT_MS;
      const remainingMs = typeof data.remainingTime === "number" ? data.remainingTime : budgetMs;
      const sec = Math.max(1, Math.ceil(remainingMs / 1000));
      initialSessionSecondsRef.current = sec;
      setSessionId(data.sessionId);
      setTimeLeftSec(sec);
      setPhase("playing");
      setMessage(data.status === "RESUME" ? "Restoring terminal session…" : "Unlocking Door 1…");

      try {
        await refreshRound(data.sessionId);
        setMessage(null);
      } catch (e) {
        setMessage(null);
        setError(e instanceof Error ? e.message : "Failed to load the chamber.");
      }
    } catch {
      setError("Network anomaly. Retrying connection...");
    } finally {
      setBusy(false);
    }
  };

  const handleDropdownChange = (id: string, value: string) => {
    const newSelections = { ...dropdownSelections, [id]: value };
    setDropdownSelections(newSelections);

    if (lastResult && !lastResult.passed) {
      setLastResult(null);
    }

    if (currentRoundData?.type === "CLASSIFY") {
      const requiredParts = currentRoundData.promptParts?.length ?? 0;
      if (Object.keys(newSelections).length === requiredParts) {
        setTimeout(() => {
          void submitPrompt(newSelections);
        }, 300);
      }
    }
  };

  // MOCK LOGIC FOR META PROMPTING HARNESS (client-side simulation)
  const handleGenerateMetaPrompt = () => {
    if (!metaPromptInput.trim()) return;
    setIsGeneratingMeta(true);
    setGeneratedPrompt(null);

    setTimeout(() => {
      setGeneratedPrompt(
        `Act as an expert data extraction AI.\n\n` +
        `Your task is to parse the provided unstructured text and output STRICTLY valid JSON representing the company hierarchy and financials.\n\n` +
        `CRITICAL CONSTRAINTS:\n` +
        `- Do not wrap the JSON output in markdown blocks.\n` +
        `- The root JSON object must contain exactly three keys: "organization" (string), "financials" (object), and "key_personnel" (array of objects).\n` +
        `- Extract "q3_revenue" as a pure integer and "growth_yoy" including the % sign.\n` +
        `- Extract exact title and full name for each executive.\n\n` +
        `Ensure 100% adherence to this schema.`
      );
      setIsGeneratingMeta(false);
      setCopied(false);
    }, 1400);
  };

  const handleCopyPrompt = () => {
    if (!generatedPrompt) return;
    void navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buildLastResult = (finalScore: number, passed: boolean): LastResult => ({
    score: finalScore * 100,
    passed,
    timeTaken: Math.max(0, Math.round((Date.now() - roundWallStartedAtRef.current) / 1000)),
    targetScore: getTargetScore(roundNumber),
  });

  const submitPrompt = async (overrideAnswers?: Record<string, string>) => {
    const sid = sessionId;
    if (!sid) return;

    const isClassify = currentRoundData?.type === "CLASSIFY";
    const isBonus = currentRoundData?.type === "BONUS";
    let prompt = "";
    let answers: Record<string, string> | undefined;

    if (isClassify) {
      const parts = currentRoundData.promptParts ?? [];
      answers = overrideAnswers || dropdownSelections;
      if (Object.keys(answers).length < parts.length) {
        setError("Please classify all sections before submitting.");
        return;
      }
    } else if (isBonus) {
      if (metaPromptInput.trim().length < 3 || finalPromptInput.trim().length < 3) {
        setError("Both meta-prompt and final prompt must be at least 3 characters.");
        return;
      }
    } else {
      prompt = promptInput.trim();
      if (prompt.length < 3) {
        setError("Prompt must be at least 3 characters.");
        return;
      }
    }

    if (attemptsRemaining === 0) {
      setError("Lockout active. No attempts remaining.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          prompt: isBonus ? undefined : prompt,
          answers,
          metaPrompt: isBonus ? metaPromptInput.trim() : undefined,
          finalPrompt: isBonus ? finalPromptInput.trim() : undefined,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;

      if (data.error === "Invalid prompt") {
        setError("Invalid payload detected.");
        return;
      }
      if (data.error === "Invalid session") {
        setError("Terminal session expired.");
        finishGame();
        return;
      }

      const status = data.status as string | undefined;

      if (status === "BONUS_AVAILABLE") {
        const rt = data.remainingTime as number | undefined;
        if (typeof rt === "number") {
          setTimeLeftSec(Math.max(0, Math.ceil(rt / 1000)));
        }
        setPhase("bonus");
        setLastResult(null);
        setMessage("WARNING: Hidden sub-level unlocked. Proceed with extreme caution.");
        setPromptInput("");
        return;
      }

      if (status === "GAME_OVER" && data.reason === "TIME_UP") {
        finishGame("Life support depleted. Time is up.");
        return;
      }

      if (status === "GAME_ALREADY_COMPLETED") {
        finishGame("Sequence already terminated.");
        return;
      }

      if (status === "EVALUATION_TIMEOUT" || status === "EVALUATION_ERROR") {
        setError(
          typeof data.message === "string"
            ? data.message
            : "Evaluation system unavailable. Please retry."
        );
        await refreshRound(sid);
        return;
      }

      if (status === "NO_ATTEMPTS_LEFT") {
        setError("Access Denied. Lockout engaged.");
        finishGame();
        return;
      }

      const finalScore = (data.finalScore as number | undefined) ?? 0;

      setStats((prev) => {
        const nextAccuracies = [...prev.accuracies];
        const currentBest = nextAccuracies[roundNumber - 1] ?? 0;
        nextAccuracies[roundNumber - 1] = Math.max(currentBest, finalScore);

        return {
          ...prev,
          accuracies: nextAccuracies,
          lastFinalScore: finalScore,
        };
      });

      if (status === "ROUND_FAILED") {
        const ar = data.attemptsRemaining as number | undefined;
        if (typeof ar === "number") setAttemptsRemaining(ar);
        setLastResult(buildLastResult(finalScore, false));
        setPromptInput("");
        await refreshRound(sid);
        return;
      }

      if (status === "ROUND_PASSED") {
        setStats((prev) => ({
          ...prev,
          roundsCompleted: Math.max(prev.roundsCompleted, roundNumber),
        }));
        setLastResult(buildLastResult(finalScore, true));
        setPromptInput("");
        setDropdownSelections({});

        if (passAdvanceTimeoutRef.current) {
          clearTimeout(passAdvanceTimeoutRef.current);
        }
        passAdvanceTimeoutRef.current = setTimeout(() => {
          passAdvanceTimeoutRef.current = null;
          setLastResult(null);
          void refreshRound(sid);
        }, PASS_ADVANCE_MS);
        return;
      }

      if (status === "GAME_COMPLETED") {
        setLastResult(buildLastResult(finalScore, true));
        setStats((prev) => ({
          ...prev,
          roundsCompleted: Math.max(prev.roundsCompleted, TOTAL_ROUNDS),
          bonusCompleted: Boolean(data.bonusUnlocked),
          highScoreBonus: Boolean(data.highScoreBonus),
          lastFinalScore: finalScore,
        }));
        setPhase("finished");
        setMessage("Facility Escaped. Uplink Terminated.");
        return;
      }
    } catch {
      setError("Signal lost. Re-transmit code.");
    } finally {
      setBusy(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const avgAccuracy = stats.accuracies.length > 0 ? stats.accuracies.reduce((a, b) => a + b, 0) / stats.accuracies.length : 0;
  const avgAccuracyPct = avgAccuracy * 100;
  const totalSecondsUsed = Math.max(0, initialSessionSecondsRef.current - timeLeftSec);
  const headerTitle = `DOOR ${roundNumber} OF ${TOTAL_ROUNDS}: ${formatTitle(currentRoundData?.type).toUpperCase()}`;
  const inputLocked = busy || attemptsRemaining === 0 || lastResult?.passed === true;
  const currentAccuracy = lastResult ? Math.min(100, Math.max(0, lastResult.score)) : 0;

  const ROUND_TYPE_LABELS: Record<number, string> = {
    1: "CLASSIFY (MCQ)",
    2: "IMPROVE",
    3: "REVERSE",
    4: "OPTIMIZE",
    5: "STRUCTURED",
    6: "BONUS (Meta-Prompting)",
  };

  type MongoRound = { round: number; attempts: number; score: number; prompt: unknown; output?: string };
  type MongoPlayer = {
    name: string;
    email: string;
    roundsPlayed: number;
    timeTaken: number;
    avgAccuracy: number;
    attemptsTaken: number;
    gameStatus: string;
    rounds: MongoRound[];
    createdAt?: string;
    completedAt?: string;
  };

  const generatePlayerPDF = (p: MongoPlayer) => {
    const formatPrompt = (prompt: unknown): string => {
      if (typeof prompt === "string") return prompt;
      if (prompt && typeof prompt === "object") {
        return Object.entries(prompt as Record<string, string>)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
      }
      return "N/A";
    };

    const timeTakenSec = p.timeTaken > 10000 ? Math.round(p.timeTaken / 1000) : p.timeTaken;
    const statusLabel = GAME_STATUS_CONFIG[p.gameStatus ?? ""]?.label ?? p.gameStatus ?? "Unknown";

    let roundsHtml = "";
    const sortedRounds = [...(p.rounds || [])].sort((a, b) => a.round - b.round);
    for (const r of sortedRounds) {
      roundsHtml += `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
            <h3 style="margin:0;color:#0891b2;font-size:14px;">Round ${r.round}: ${ROUND_TYPE_LABELS[r.round] ?? "Unknown"}</h3>
            <div style="display:flex;gap:16px;font-size:12px;color:#64748b;">
              <span>Score: <strong style="color:${r.score >= 0.6 ? "#16a34a" : "#dc2626"}">${(r.score * 100).toFixed(1)}%</strong></span>
              <span>Attempts: <strong>${r.attempts}</strong></span>
            </div>
          </div>
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Player Prompt / Response</div>
            <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:300px;overflow-y:auto;">${formatPrompt(r.prompt).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
          </div>
          ${r.output ? `
          <div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">AI Output</div>
            <pre style="background:#f0fdf4;color:#14532d;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:300px;overflow-y:auto;border:1px solid #bbf7d0;">${r.output.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
          </div>` : ""}
        </div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${p.name} - Prompt Wars Response Report</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; color: #1e293b; background: #fff; }
      @media print { body { padding: 16px; } }
    </style></head><body>
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="color:#0891b2;margin:0 0 4px;font-size:24px;">Prompt Wars - Response Report</h1>
        <p style="color:#64748b;margin:0;font-size:13px;">Player Submission Details</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;padding:20px;background:#f1f5f9;border-radius:8px;border:1px solid #e2e8f0;">
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Name</span><br/><strong>${p.name}</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Email</span><br/><strong>${p.email}</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Rounds Played</span><br/><strong>${p.roundsPlayed}</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Time Taken</span><br/><strong>${Math.floor(timeTakenSec / 60)}m ${timeTakenSec % 60}s</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Avg Accuracy</span><br/><strong>${(p.avgAccuracy * 100).toFixed(1)}%</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Total Attempts</span><br/><strong>${p.attemptsTaken}</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Status</span><br/><strong>${statusLabel}</strong></div>
        <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Completed At</span><br/><strong>${p.completedAt ? new Date(p.completedAt).toLocaleString() : "N/A"}</strong></div>
      </div>
      <h2 style="color:#0891b2;font-size:16px;margin-bottom:16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Round-by-Round Responses</h2>
      ${sortedRounds.length > 0 ? roundsHtml : '<p style="color:#94a3b8;text-align:center;padding:24px;">No round data recorded.</p>'}
      <p style="color:#94a3b8;text-align:center;font-size:11px;margin-top:32px;">Generated on ${new Date().toLocaleString()}</p>
    </body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        URL.revokeObjectURL(url);
      };
    }
  };

  const downloadPlayerResponses = async (email: string) => {
    if (!currentAdminToken) {
      alert("Admin session expired");
      return;
    }

    try {
      const res = await fetch(`/api/admin/player-responses?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${currentAdminToken}` },
      });
      const data = (await res.json()) as { error?: string; player?: MongoPlayer };
      if (!res.ok || !data.player) {
        alert(data.error ?? "Failed to fetch player data");
        return;
      }
      generatePlayerPDF(data.player);
    } catch {
      alert("Network error fetching player data");
    }
  };

  const downloadFullLeaderboard = async () => {
    if (!currentAdminToken) {
      alert("Admin session expired");
      return;
    }

    try {
      const res = await fetch("/api/admin/export-leaderboard", {
        headers: { Authorization: `Bearer ${currentAdminToken}` },
      });
      const data = (await res.json()) as { error?: string; players?: MongoPlayer[] };
      if (!res.ok || !data.players) {
        alert(data.error ?? "Failed to fetch leaderboard");
        return;
      }

      let rows = "Rank,Name,Email,Rounds Played,Time Taken (s),Avg Accuracy (%),Total Attempts,Status\n";
      data.players.forEach((p, idx) => {
        const timeSec = p.timeTaken > 10000 ? Math.round(p.timeTaken / 1000) : p.timeTaken;
        const status = GAME_STATUS_CONFIG[p.gameStatus ?? ""]?.label ?? p.gameStatus ?? "";
        rows += `${idx + 1},"${p.name}","${p.email}",${p.roundsPlayed},${timeSec},${(p.avgAccuracy * 100).toFixed(1)},${p.attemptsTaken},"${status}"\n`;

        for (const r of (p.rounds || []).sort((a, b) => a.round - b.round)) {
          const promptStr = typeof r.prompt === "string"
            ? r.prompt.replace(/"/g, '""')
            : JSON.stringify(r.prompt).replace(/"/g, '""');
          const outputStr = (r.output ?? "").replace(/"/g, '""');
          rows += `,,Round ${r.round}: ${ROUND_TYPE_LABELS[r.round] ?? ""},Attempts: ${r.attempts},Score: ${(r.score * 100).toFixed(1)}%,"${promptStr}","${outputStr}"\n`;
        }
      });

      const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `prompt-wars-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Network error exporting leaderboard");
    }
  };

  return (
    <div className="min-h-screen text-slate-300 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-amber-500/30 selection:text-amber-100 relative z-0 escape-bg">

      {/* Global Vignette and Scanlines */}
      <div className="fixed inset-0 z-[-1] grid-overlay pointer-events-none opacity-40"></div>
      <div className="fixed inset-0 z-50 pointer-events-none scanline-overlay opacity-10 mix-blend-overlay"></div>

      {/* ADMIN DASHBOARD VIEW */}      
      {phase === "admin-view" && (
        <div className="w-full max-w-7xl terminal-panel p-6 md:p-8 rounded-xl relative">
          <div className="screen-glare absolute inset-0 rounded-xl" />
          <div className="relative z-10 flex flex-col gap-6">

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 border-b border-cyan-900/50 pb-4 gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                <h1 className="text-3xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] tracking-widest uppercase">Admin Terminal</h1>
                <div className="flex gap-2 bg-black/50 p-1 rounded border border-cyan-900/30">
                  <button onClick={() => setAdminTab("preview")} className={`px-4 py-2 rounded text-sm font-bold uppercase tracking-wider transition-all ${adminTab === "preview" ? "bg-cyan-900/60 text-cyan-200 border border-cyan-700 shadow-[0_0_10px_rgba(34,211,238,0.2)]" : "text-cyan-800 hover:text-cyan-500"}`}>Simulation Matrix</button>
                  <button onClick={() => setAdminTab("leaderboard")} className={`px-4 py-2 rounded text-sm font-bold uppercase tracking-wider transition-all ${adminTab === "leaderboard" ? "bg-cyan-900/60 text-cyan-200 border border-cyan-700 shadow-[0_0_10px_rgba(34,211,238,0.2)]" : "text-cyan-800 hover:text-cyan-500"}`}>Operative Roster</button>
                </div>
              </div>
              <div className="flex gap-2">
                {adminTab === "leaderboard" && (
                  <>
                    <button onClick={() => currentAdminToken && void loadAdminPlayers(currentAdminToken)} className="text-sm bg-cyan-900 hover:bg-cyan-800 text-cyan-100 border border-cyan-600 px-4 py-2 rounded uppercase font-bold tracking-wider">Sync Data</button>
                    <button onClick={() => void downloadFullLeaderboard()} className="text-sm bg-green-900/60 hover:bg-green-800/80 text-green-200 border border-green-700 px-4 py-2 rounded uppercase font-bold tracking-wider">Export All (CSV)</button>
                  </>
                )}
                <button onClick={() => { setCurrentAdminToken(null); setAdminPreviewRounds(null); setPhase("welcome"); setPlayer({ name: "", email: "" }); setError(null); }} className="text-sm bg-red-900/50 hover:bg-red-800/80 border border-red-800 text-red-200 px-4 py-2 rounded uppercase font-bold tracking-wider">Sever Uplink</button>
              </div>
            </div>

            {error && <p className="text-red-400 font-mono text-sm bg-red-950/50 border border-red-900 p-2 rounded" role="alert">ERR: {error}</p>}

            {/* --- ADMIN TAB 1: ROUND PREVIEW --- */}
            {adminTab === "preview" && (
              <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 bg-black/40 p-4 rounded border border-cyan-900/30">
                  <label className="text-cyan-600 font-bold uppercase tracking-widest text-sm">Select Sector:</label>
                  <select value={adminRoundNumber} onChange={(e) => setAdminRoundNumber(Number(e.target.value))} className="bg-black text-cyan-300 border border-cyan-800 rounded p-2 outline-none focus:ring-1 focus:ring-cyan-500 font-mono">
                    {Array.from({ length: TOTAL_ROUNDS }, (_, idx) => (
                      <option key={idx + 1} value={idx + 1}>DOOR {idx + 1}</option>
                    ))}
                  </select>
                  <span className="text-cyan-800 text-sm ml-auto font-mono hidden sm:block">{"// VIEW_MODE: OVERRIDE //"}</span>
                </div>

                {adminPreviewRounds?.[adminRoundNumber - 1] && (() => {
                  const previewRound = adminPreviewRounds[adminRoundNumber - 1];
                  return (
                    <div className="border border-slate-700/50 rounded-xl p-6 bg-black/50 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] relative mt-2">
                      <div className="flex justify-between items-end mb-4 border-b border-slate-800 pb-4 gap-4">
                        <h2 className="text-2xl font-bold text-slate-300 font-mono">DOOR {adminRoundNumber} OF {TOTAL_ROUNDS}: {formatTitle(previewRound.type).toUpperCase()}</h2>
                        <div className="text-2xl font-mono font-bold shrink-0 text-red-900/50 bg-black/50 px-3 py-1 rounded border border-red-900/20">20:00</div>
                      </div>

                      <div className="flex gap-6 items-stretch flex-col md:flex-row mt-6">
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">

                          {/* LEFT COLUMN: SCENARIO */}
                          <div className="space-y-4 flex flex-col max-h-[600px] overflow-y-auto custom-scrollbar pr-3 pb-4">
                            <div className="bg-slate-900/40 p-5 rounded border border-slate-700/50 shrink-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                              <h3 className="text-sm uppercase tracking-widest text-amber-500/70 mb-3 font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500/70"></span> Mission Parameters
                              </h3>
                              <p className="text-md leading-relaxed text-slate-300 font-mono">{previewRound.instruction}</p>
                            </div>

                            {previewRound.originalPrompt && (
                              <div className="bg-red-950/20 p-5 rounded border border-red-900/30 shrink-0">
                                <h3 className="text-sm uppercase tracking-widest text-red-500/70 mb-3 font-bold flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-red-500/70 animate-pulse"></span> Corrupted Sequence
                                </h3>
                                <div className="font-mono text-sm text-red-300/80 bg-black/60 p-3 rounded border border-red-900/50">
                                  &quot;{previewRound.originalPrompt}&quot;
                                </div>
                              </div>
                            )}

                            {previewRound.type !== "BONUS" && (
                              <div className="bg-cyan-950/20 p-5 rounded border border-cyan-900/30 shrink-0">
                                <h3 className="text-sm uppercase tracking-widest text-cyan-500/70 mb-3 font-bold flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-cyan-500/70"></span> System Constraints
                                </h3>
                                <ul className="list-square list-inside font-mono text-sm text-cyan-100/70 space-y-2">
                                  {formatConstraints(previewRound.constraints).map((c, i) => (
                                    <li key={i} className="pl-2 border-l border-cyan-800/50 ml-1">{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {previewRound.input && (
                              <div className="bg-black/60 p-4 rounded border border-slate-800 shrink-0">
                                <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2 font-bold">Raw Input Data</h3>
                                <div className="font-mono text-xs text-slate-400 whitespace-pre-wrap">
                                  {previewRound.input}
                                </div>
                              </div>
                            )}

                            {previewRound.expectedOutput && (
                              <div className="bg-black/80 p-4 rounded border border-green-900/30 shrink-0 relative shadow-[inset_0_0_15px_rgba(22,163,74,0.1)]">
                                <h3 className="text-xs uppercase tracking-widest text-green-500/70 mb-2 font-bold">
                                  {adminRoundNumber === 4 ? "Required Extraction Format" : "Target Signature"}
                                  {adminRoundNumber === 2 && <span className="text-red-500/70 ml-2">(Classified)</span>}
                                </h3>
                                <div className="font-mono text-xs text-green-400/80 whitespace-pre-wrap">
                                  {previewRound.expectedOutput}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* RIGHT COLUMN: INPUT */}
                          <div className="flex flex-col gap-4">
                            <div className="flex-grow flex flex-col">
                              <div className="flex justify-between text-xs font-mono text-slate-500 mb-2 px-1 uppercase tracking-wider">
                                <span>Lock threshold: {getTargetScore(adminRoundNumber)}.00</span>
                                <span>
                                  {ATTEMPT_LIMITS[adminRoundNumber] != null
                                    ? `Sec-Attempts: ${ATTEMPT_LIMITS[adminRoundNumber]}`
                                    : "Attempts: Unrestricted"}
                                </span>
                              </div>

                              {previewRound.type === "CLASSIFY" ? (
                                <div className="w-full grow bg-black/60 rounded border border-slate-700/50 p-6 overflow-y-auto shadow-[inset_0_0_30px_rgba(0,0,0,1)] opacity-90">
                                  <h3 className="text-sm font-bold text-amber-500 mb-6 pb-4 border-b border-slate-800 uppercase tracking-widest">Identify Anomaly Signatures</h3>
                                  <div className="font-mono text-sm text-slate-300 leading-relaxed space-y-6">
                                    {previewRound.promptParts?.map((part) => (
                                      <div key={part.id} className="relative pl-4 border-l-2 border-slate-700">
                                        <span className="whitespace-pre-wrap block mb-3">{part.text}</span>
                                        <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-2 rounded inline-block">
                                          <span className="text-slate-500 font-bold hidden sm:inline">] ────►</span>
                                          <select className="w-48 bg-black text-slate-500 border border-slate-700 rounded p-1.5 font-sans text-xs outline-none" disabled>
                                            <option>Select Override...</option>
                                          </select>
                                          <span className="text-xs text-green-500 font-bold uppercase tracking-wider bg-green-950/30 px-2 py-1 rounded">✓ {part.answer}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : previewRound.type === "BONUS" ? (
                                <div className="w-full grow bg-black/60 rounded border border-slate-700/50 p-6 overflow-y-auto shadow-[inset_0_0_30px_rgba(0,0,0,1)] opacity-90 flex flex-col gap-6">
                                  <div className="flex flex-col gap-2">
                                    <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-2">
                                      <span className="bg-cyan-900/50 text-cyan-200 px-2 py-0.5 rounded border border-cyan-800">PHASE 1</span> Inject Architecture
                                    </h3>
                                    <textarea className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm font-mono text-slate-500 shadow-inner" disabled placeholder="Input meta-sequence..."></textarea>
                                    <button disabled className="mt-2 bg-cyan-900/30 border border-cyan-800 text-cyan-600 px-4 py-2 rounded text-xs font-bold w-full uppercase tracking-widest">Compile AI Code</button>
                                  </div>
                                  <div className="flex flex-col gap-2 opacity-50">
                                    <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
                                      <span className="bg-green-900/50 text-green-200 px-2 py-0.5 rounded">Phase 2</span> Execute Payload
                                    </h3>
                                    <textarea className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm font-mono text-slate-500 shadow-inner" disabled placeholder="Paste compiled code..."></textarea>
                                  </div>
                                </div>
                              ) : (
                                <textarea
                                  className="w-full grow p-4 bg-black/80 rounded border border-slate-700 text-slate-600 outline-none font-mono text-sm resize-none min-h-[250px] shadow-[inset_0_0_30px_rgba(0,0,0,1)] cursor-not-allowed leading-relaxed"
                                  placeholder="Terminal locked in view mode..."
                                  disabled
                                />
                              )}
                            </div>

                            {previewRound.type !== "CLASSIFY" && (
                              <button disabled className="bg-slate-900 border border-slate-800 text-slate-700 p-4 rounded font-bold text-sm tracking-widest uppercase cursor-not-allowed">
                                Initiate Override
                              </button>
                            )}
                          </div>
                        </div>

                        {previewRound.type !== "CLASSIFY" && (
                          <div className="hidden md:flex w-12 bg-black/80 border border-slate-800 rounded flex-col justify-end items-center relative overflow-hidden shrink-0 shadow-[inset_0_0_20px_rgba(0,0,0,1)] py-4 min-h-[280px] opacity-70">
                            <div className="absolute w-full h-[1px] bg-amber-500/50 z-10" style={{ bottom: `${getTargetScore(adminRoundNumber)}%` }}>
                              <span className="absolute -top-5 right-1 text-[10px] font-mono text-amber-500">{getTargetScore(adminRoundNumber)}</span>
                            </div>
                            <div className="absolute bottom-4 text-[10px] uppercase tracking-widest text-slate-700 rotate-180 font-bold font-mono" style={{ writingMode: "vertical-rl" }}>Match %</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* --- ADMIN TAB 2: LEADERBOARD --- */}
            {adminTab === "leaderboard" && (
              <div className="bg-black/60 p-6 rounded border border-cyan-900/30 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                <h2 className="text-lg font-mono font-bold text-cyan-500 mb-6 uppercase tracking-widest border-b border-cyan-900/50 pb-2">Global Operative Registry</h2>
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                  {sortedAdminPlayers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 border border-dashed border-cyan-900/50 rounded bg-cyan-950/10">
                      <span className="text-3xl mb-3 opacity-50">📡</span>
                      <p className="text-cyan-700 font-mono text-sm uppercase tracking-widest">No active signals detected.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded border border-slate-800">
                      <table className="w-full text-left border-collapse font-mono text-sm">
                        <thead className="bg-slate-900/80 sticky top-0 z-10">
                          <tr className="border-b border-slate-700 text-cyan-600/70 text-xs uppercase tracking-widest">
                            <th className="p-4 font-bold">Operative Identity</th>
                            <th className="p-4 font-bold text-center">Sectors</th>
                            <th className="p-4 font-bold text-center">Duration</th>
                            <th className="p-4 font-bold text-center">Precision</th>
                            <th className="p-4 font-bold text-center">Burn Rate</th>
                            <th className="p-4 font-bold text-center">Status</th>
                            <th className="p-4 font-bold text-center">Responses</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 bg-black/40">
                          {sortedAdminPlayers.map((p, idx) => {
                            const statusCfg = GAME_STATUS_CONFIG[p.gameStatus ?? ""] ?? { label: "In Progress", color: "text-slate-500" };
                            return (
                              <tr key={p.playerId} className="hover:bg-cyan-950/20 transition-colors group">
                                <td className="p-4">
                                  <div className="font-bold text-slate-300 flex items-center gap-3">
                                    <span className="text-cyan-800 w-6 text-right">0{idx + 1}</span>
                                    <span className="group-hover:text-cyan-300 transition-colors">{p.name}</span>
                                  </div>
                                  {p.email && <div className="text-[10px] text-slate-600 ml-9 mt-1">{p.email}</div>}
                                </td>
                                <td className="p-4 text-slate-400 text-center">{p.roundsPlayed}</td>
                                <td className="p-4 text-slate-400 text-center">{p.timeTakenSec}s</td>
                                <td className="p-4 text-green-500 font-bold text-center">{(p.averageScore * 100).toFixed(1)}%</td>
                                <td className="p-4 text-slate-500 text-center">{p.attemptsUsed}</td>
                                <td className={`p-4 font-bold text-center text-xs uppercase tracking-wider ${statusCfg.color}`}>{statusCfg.label}</td>
                                <td className="p-4 text-center">
                                  {p.email && (
                                    <button
                                      onClick={() => void downloadPlayerResponses(p.email!)}
                                      className="bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-700/50 text-cyan-300 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all hover:shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                                    >
                                      Download
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* STEP 0: SPLASH SCREEN (INITIAL LOAD) */}
      {phase === "splash" && (
        <div className="w-full flex flex-col items-center justify-center text-center animate-in fade-in duration-1000 z-10">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-amber-500/20 blur-[100px] rounded-full pointer-events-none"></div>
            <Image
              src="/neon-sign-escape-room-with-brick-wall-background-free-vector.jpg"
              alt="Escape Room"
              width={1200}
              height={800}
              priority
              sizes="(max-width: 768px) 100vw, 42rem"
              className="relative w-full max-w-md md:max-w-lg mx-auto rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-slate-800 object-cover"
            />
          </div>

          <h1 className="text-6xl md:text-8xl font-black mb-12 text-transparent bg-clip-text bg-gradient-to-b from-slate-100 to-slate-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] tracking-tighter uppercase">
            PROMPT <span className="text-amber-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">WARS</span>
          </h1>

          <button
            type="button"
            onClick={() => setPhase("welcome")}
            className="group relative px-12 py-4 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/50 text-cyan-400 font-mono font-bold text-xl rounded uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(8,145,178,0.2)] hover:shadow-[0_0_30px_rgba(8,145,178,0.5)]"
          >
            Enter Facility
          </button>
        </div>
      )}

      {/* STEP 1: LANDING PAGE (WELCOME) */}      
      {phase === "welcome" && (
        <div className="w-full max-w-3xl terminal-panel p-10 md:p-16 rounded-xl relative text-center">
          <div className="screen-glare absolute inset-0 rounded-xl" />

          <div className="relative z-10">
            <div className="inline-block mb-6 border border-amber-900/50 bg-amber-950/20 px-4 py-1 rounded text-amber-500 text-xs font-mono font-bold tracking-[0.3em] uppercase">
              Classified Simulation
            </div>

            <h1 className="text-5xl md:text-7xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-b from-slate-100 to-slate-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] tracking-tighter">
              PROMPT <span className="text-amber-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">WARS</span>
            </h1>
            <p className="text-md text-slate-400 font-mono tracking-widest uppercase mb-12">
              The Ultimate Engineering Gauntlet
            </p>

            <div className="space-y-6 text-slate-300 text-sm md:text-base leading-relaxed text-left max-w-2xl mx-auto">

              <section className="bg-black/60 p-6 md:p-8 rounded border border-slate-700/50 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]">
                <h2 className="text-lg font-mono font-bold text-cyan-400 mb-4 flex items-center gap-3 uppercase tracking-widest border-b border-cyan-900/30 pb-2">
                  <span className="bg-cyan-500 w-2 h-2 rounded-full animate-pulse"></span> Mission Briefing
                </h2>
                <p className="mb-4 text-slate-400">
                  <strong className="text-slate-200">Prompt Wars</strong> is a high-stress simulation designed to test your ability to command and manipulate AI systems using raw text constraints.
                </p>
                <p className="mb-6 text-slate-400">
                  You will be locked into <strong className="text-slate-200">5 sequential containment sectors</strong>. To progress, you must decipher the required logic and generate the exact target code.
                </p>
                <div className="bg-amber-950/20 border border-amber-900/50 p-4 rounded text-sm font-mono">
                  <p className="text-amber-500/90">
                    <strong className="text-amber-400 block mb-1">WARNING: HIDDEN DIRECTIVE</strong>
                    Operatives who clear all 5 sectors before life support failure will unlock the classified.
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                <div className="bg-black/40 p-4 rounded border border-slate-800 flex flex-col justify-center">
                  <h2 className="text-green-500 font-bold mb-2 uppercase tracking-widest">🎯 Primary Objective</h2>
                  <p className="text-slate-500 leading-relaxed">Execute all overrides with maximum precision and speed before the master countdown hits zero.</p>
                </div>
                <div className="bg-black/40 p-4 rounded border border-slate-800 flex flex-col justify-center">
                  <h2 className="text-purple-400 font-bold mb-2 uppercase tracking-widest">🏆 Final Outcome</h2>
                  <p className="text-slate-500 leading-relaxed">Your neural efficiency will be recorded on the Global Operative Registry.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center pt-10 mt-6 border-t border-slate-800/50">
              <button
                type="button"
                onClick={() => setPhase("instructions")}
                className="group relative px-12 py-4 bg-cyan-700 hover:bg-cyan-600 border border-cyan-400 text-cyan-50 font-mono font-bold text-lg rounded uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_30px_rgba(8,145,178,0.6)]"
              >
                Access Protocols
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: INSTRUCTIONS PAGE */}      
      {phase === "instructions" && (
        <div className="w-full max-w-5xl terminal-panel p-8 md:p-12 rounded-xl relative">
          <div className="screen-glare absolute inset-0 rounded-xl" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8 border-b border-slate-700 pb-6">
              <div>
                <h1 className="text-3xl font-black text-amber-500 flex items-center gap-3 uppercase tracking-wider drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                  ⚠️ Operation Parameters
                </h1>
                <p className="text-slate-400 mt-2 text-sm font-mono tracking-wide">Review simulation rules before initializing terminal uplink.</p>
              </div>
              <button onClick={() => setPhase("welcome")} className="text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-widest transition-colors font-mono">
                [ ABORT & RETURN ]
              </button>
            </div>

            <div className="space-y-6 text-sm font-sans">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <section className="bg-black/50 p-6 rounded border border-red-900/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                  <h2 className="text-md font-mono font-bold text-red-500 mb-4 flex items-center gap-2 uppercase tracking-widest border-b border-red-900/30 pb-2">
                    ⏱️ Life Support Timer
                  </h2>
                  <ul className="list-square list-inside space-y-2 text-slate-400 ml-1">
                    <li>Facility allows <strong className="text-slate-200">20 minutes total</strong> for all sectors.</li>
                    <li>Timer activates upon terminal initialization.</li>
                    <li>Countdown <strong className="text-red-400 font-bold">CANNOT BE PAUSED</strong>.</li>
                    <li>Depletion results in immediate simulation failure.</li>
                  </ul>
                </section>

                <section className="bg-black/50 p-6 rounded border border-amber-900/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                  <h2 className="text-md font-mono font-bold text-amber-500 mb-4 flex items-center gap-2 uppercase tracking-widest border-b border-amber-900/30 pb-2">
                    🔁 Security Lockouts
                  </h2>
                  <ul className="list-square list-inside space-y-2 text-slate-400 ml-1">
                    <li>Rounds 1-3 have <strong className="text-slate-200">unrestricted attempts</strong> within the master timer.</li>
                    <li>Round 4 allows <strong className="text-slate-200">3 attempts</strong>, round 5 allows <strong className="text-slate-200">2 attempts</strong>, and the bonus round allows <strong className="text-slate-200">1 submission</strong>.</li>
                    <li>Exhausting the capped rounds ends the run immediately.</li>
                  </ul>
                </section>

                <section className="bg-black/50 p-6 rounded border border-purple-900/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                  <h2 className="text-md font-mono font-bold text-purple-400 mb-4 flex items-center gap-2 uppercase tracking-widest border-b border-purple-900/30 pb-2">
                    🚫 Anti-Cheat Protocols
                  </h2>
                  <ul className="list-square list-inside space-y-2 text-slate-400 ml-1">
                    <li>Focus loss (tab switching) is <strong className="text-purple-400 font-bold">STRICTLY PROHIBITED</strong>.</li>
                    <li>Violations deduct <strong className="text-slate-200">15 seconds</strong> from life support.</li>
                    <li>Copy/Paste functions are disabled on standard terminals.</li>
                  </ul>
                </section>

                <section className="bg-black/50 p-6 rounded border border-cyan-900/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                  <h2 className="text-md font-mono font-bold text-cyan-500 mb-4 flex items-center gap-2 uppercase tracking-widest border-b border-cyan-900/30 pb-2">
                    🔒 Persistence Rules
                  </h2>
                  <ul className="list-square list-inside space-y-2 text-slate-400 ml-1">
                    <li><strong className="text-slate-200">One attempt</strong> per operative identity.</li>
                    <li>Terminal reboots (refresh) will <strong className="text-cyan-600 font-bold">NOT</strong> reset the timer.</li>
                    <li>Connections resume from point of failure.</li>
                  </ul>
                </section>
              </div>

              <section className="bg-slate-900/40 p-6 rounded border border-green-900/50 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] mt-4">
                <h2 className="text-sm font-mono font-bold text-green-500 mb-4 uppercase tracking-widest">
                  🏆 Evaluation Matrix Ranking Order
                </h2>
                <div className="flex flex-col md:flex-row gap-3 font-mono text-[10px] text-green-400 uppercase tracking-widest text-center">
                  <div className="flex-1 bg-green-950/20 p-3 rounded border border-green-900/50">1. Rounds Reached</div>
                  <div className="flex-1 bg-green-950/20 p-3 rounded border border-green-900/50">2. Accuracy + Speed Composite</div>
                  <div className="flex-1 bg-green-950/20 p-3 rounded border border-green-900/50">3. Fewer Attempts / Round</div>
                  <div className="flex-1 bg-green-950/20 p-3 rounded border border-green-900/50">4. Deterministic Tie-Break</div>
                </div>
              </section>

              <div className="flex flex-col items-center justify-center pt-8 mt-6 border-t border-slate-800">
                <p className="text-amber-500/80 text-xs font-mono uppercase tracking-widest mb-6 animate-pulse">Ensure stable uplink before proceeding.</p>
                <button
                  type="button"
                  onClick={() => setPhase("register")}
                  className="group relative px-16 py-4 bg-green-700 hover:bg-green-600 border border-green-400 text-green-50 font-mono font-bold text-xl rounded uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(21,128,61,0.4)] hover:shadow-[0_0_30px_rgba(21,128,61,0.6)]"
                >
                  Accept Terms
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* STEP 3: REGISTRATION VIEW */}
      {phase === "register" && (
        <div className="w-full max-w-md terminal-panel p-8 md:p-10 rounded-xl relative shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="screen-glare absolute inset-0 rounded-xl" />

          <div className="relative z-10">
            <button onClick={() => setPhase("instructions")} className="absolute -top-2 -left-2 text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-widest transition-colors font-mono">
              [ ABORT ]
            </button>

            <div className="flex flex-col gap-6 mt-8">
              <div className="text-center mb-2">
                <h1 className="text-2xl font-black mb-2 text-cyan-400 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                  Operative Login
                </h1>
                <p className="text-slate-500 text-xs font-mono uppercase tracking-wider">
                  Input credentials to unlock terminal.
                </p>
              </div>
              {error && (
                <p className="text-red-400 font-mono text-xs bg-red-950/50 border border-red-900 p-2 rounded text-center" role="alert">
                  ERR: {error}
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-cyan-600 font-mono uppercase tracking-widest ml-1 mb-1 block">Identity / Name</label>
                  <input
                    type="text"
                    className="w-full p-4 bg-black/80 rounded border border-cyan-900/50 text-cyan-300 outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 font-mono text-sm shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] transition-all"
                    value={player.name}
                    onChange={(e) => setPlayer((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-cyan-600 font-mono uppercase tracking-widest ml-1 mb-1 block">Comm-Link / Email</label>
                  <input
                    type="email"
                    className="w-full p-4 bg-black/80 rounded border border-cyan-900/50 text-cyan-300 outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 font-mono text-sm shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] transition-all"
                    value={player.email}
                    onChange={(e) => setPlayer((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void startGame()}
                disabled={busy}
                className="mt-4 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 disabled:bg-slate-800 disabled:border-slate-700 border border-cyan-400 text-cyan-50 py-4 rounded font-mono font-bold text-sm tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]"
              >
                {busy ? "Establishing Uplink..." : "Initialize Sequence"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAMEPLAY VIEW */}
      {(phase === "playing" || phase === "bonus") && currentRoundData && (
        <div className="w-full max-w-7xl terminal-panel p-6 md:p-8 rounded-xl relative shadow-[0_0_50px_rgba(0,0,0,0.9)]">
          <div className="screen-glare absolute inset-0 rounded-xl" />

          <div className="relative z-10 flex flex-col gap-6">

            {/* GAME HEADER */}
            <div className="flex justify-between items-end mb-2 border-b border-slate-700 pb-4 gap-4">
              <h2 className="text-xl md:text-2xl font-bold text-slate-200 font-mono drop-shadow-md">{headerTitle}</h2>
              <div
                className={`text-2xl md:text-3xl font-mono font-bold shrink-0 px-4 py-1 rounded border ${timeLeftSec < 60
                    ? "text-red-500 bg-red-950/30 border-red-900/50 animate-pulse drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                    : "text-amber-500 bg-amber-950/20 border-amber-900/30 drop-shadow-[0_0_5px_rgba(245,158,11,0.4)]"
                  }`}
              >
                {formatTime(timeLeftSec)}
              </div>
            </div>

            {message && <p className="text-amber-400 font-mono text-xs bg-amber-950/30 border border-amber-900/50 p-3 rounded">{message}</p>}
            {error && <p className="text-red-400 font-mono text-xs bg-red-950/30 border border-red-900/50 p-3 rounded">ERR: {error}</p>}

            <div className="flex gap-6 items-stretch flex-col md:flex-row">

              {/* LEFT COLUMN: CONTEXT */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div
                  className="space-y-4 flex flex-col max-h-[600px] overflow-y-auto custom-scrollbar pr-3 pb-4 select-none"
                  onCopy={(e) => {
                    e.preventDefault();
                    void reportViolation("COPY_PASTE");
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <div className="bg-slate-900/40 p-5 rounded border border-slate-700/50 shrink-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                    <h3 className="text-sm uppercase tracking-widest text-amber-500/70 mb-3 font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500/70"></span> Mission Parameters
                    </h3>
                    <p className="text-md leading-relaxed text-slate-300 font-mono">{currentRoundData.instruction}</p>
                  </div>

                  {currentRoundData.originalPrompt && (
                    <div className="bg-red-950/20 p-5 rounded border border-red-900/30 shrink-0">
                      <h3 className="text-sm uppercase tracking-widest text-red-500/70 mb-3 font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500/70 animate-pulse"></span> Corrupted Sequence
                      </h3>
                      <div className="font-mono text-sm text-red-300/80 bg-black/60 p-3 rounded border border-red-900/50">
                        &quot;{currentRoundData.originalPrompt}&quot;
                      </div>
                    </div>
                  )}

                  {currentRoundData.type !== "BONUS" && (
                    <div className="bg-cyan-950/20 p-5 rounded border border-cyan-900/30 shrink-0">
                      <h3 className="text-sm uppercase tracking-widest text-cyan-500/70 mb-3 font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-500/70"></span> System Constraints
                      </h3>
                      <ul className="list-square list-inside font-mono text-sm text-cyan-100/70 space-y-2">
                        {formatConstraints(currentRoundData.constraints).map((c, i) => (
                          <li key={i} className="pl-2 border-l border-cyan-800/50 ml-1">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentRoundData.input && (
                    <div className="bg-black/60 p-4 rounded border border-slate-800 shrink-0">
                      <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2 font-bold">Raw Input Data</h3>
                      <div className="font-mono text-xs text-slate-400 whitespace-pre-wrap">
                        {currentRoundData.input}
                      </div>
                    </div>
                  )}

                  {currentRoundData.expectedOutput && roundNumber !== 1 && (
                    <div className="bg-black/80 p-4 rounded border border-green-900/30 shrink-0 relative shadow-[inset_0_0_15px_rgba(22,163,74,0.1)]">
                      <h3 className="text-xs uppercase tracking-widest text-green-500/70 mb-2 font-bold">
                        {roundNumber === 4 ? "Required Extraction Format" : "Target Signature"}
                      </h3>
                      <div className="font-mono text-xs text-green-400/80 whitespace-pre-wrap">
                        {currentRoundData.expectedOutput}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: INPUT */}
                <div className="flex flex-col gap-4">
                  <div className="flex-grow flex flex-col">
                    <div className="flex justify-between text-xs font-mono text-slate-500 mb-2 px-1 uppercase tracking-wider">
                      <span>Lock threshold: {getTargetScore(roundNumber)}.00</span>
                      <span className={roundNumber >= 5 && attemptsRemaining <= 1 ? "text-red-500 font-bold bg-red-950/50 px-2 py-0.5 rounded border border-red-900" : ""}>
                        {attemptsRemaining < 0 ? "Attempts: Unrestricted" : `Sec-Attempts: ${attemptsRemaining}`}
                      </span>
                    </div>

                    {currentRoundData.type === "CLASSIFY" ? (
                      <div className="w-full grow bg-black/60 rounded border border-slate-700/50 p-6 overflow-y-auto shadow-[inset_0_0_30px_rgba(0,0,0,1)] opacity-90">
                        <h3 className="text-sm font-bold text-amber-500 mb-2 uppercase tracking-widest">Identify Anomaly Signatures</h3>
                        <p className="text-xs text-slate-500 mb-6 pb-4 border-b border-slate-800 font-mono">
                          {"// Terminal will auto-compile upon full selection"}
                        </p>
                        <div className="font-mono text-sm text-slate-300 leading-relaxed space-y-6">
                          {currentRoundData.promptParts?.map((part) => {
                            const isSelected = !!dropdownSelections[part.id];
                            return (
                              <div key={part.id} className={`relative pl-4 border-l-2 transition-colors ${isSelected ? 'border-cyan-600' : 'border-slate-700'}`}>
                                <span className={`whitespace-pre-wrap block mb-3 transition-colors ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>{part.text}</span>
                                <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-2 rounded inline-block">
                                  <span className={`font-bold hidden sm:inline transition-colors ${isSelected ? 'text-cyan-600' : 'text-slate-600'}`}>] ────►</span>
                                  <select
                                    className={`w-48 bg-black text-slate-300 border rounded p-1.5 font-sans text-xs outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50 transition-colors ${isSelected ? 'border-cyan-700/50' : 'border-slate-700'}`}
                                    value={dropdownSelections[part.id] ?? ""}
                                    onChange={(e) => handleDropdownChange(part.id, e.target.value)}
                                    disabled={inputLocked}
                                  >
                                    <option value="" disabled>Select Override...</option>
                                    {part.options.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : currentRoundData.type === "BONUS" ? (
                      <div className="w-full grow bg-black/60 rounded border border-slate-700/50 p-6 overflow-y-auto shadow-[inset_0_0_30px_rgba(0,0,0,1)] opacity-90 flex flex-col gap-6">

                        <div className="flex flex-col gap-2">
                          <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="bg-cyan-900/50 text-cyan-200 px-2 py-0.5 rounded border border-cyan-800">PHASE 1</span> Inject Architecture
                          </h3>
                          <textarea
                            className="w-full h-24 p-3 bg-slate-950 rounded border border-slate-700 text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-sm resize-none shadow-inner disabled:opacity-50"
                            placeholder="Input meta-sequence instructions..."
                            value={metaPromptInput}
                            onChange={(e) => setMetaPromptInput(e.target.value)}
                            disabled={inputLocked || isGeneratingMeta}
                            onPaste={(e) => { e.preventDefault(); void reportViolation("COPY_PASTE"); }}
                          />
                          <button
                            onClick={handleGenerateMetaPrompt}
                            disabled={inputLocked || isGeneratingMeta || !metaPromptInput.trim()}
                            className="self-end bg-cyan-900/50 hover:bg-cyan-800/80 border border-cyan-800 text-cyan-400 disabled:bg-slate-900 disabled:border-slate-800 disabled:text-slate-600 px-4 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all"
                          >
                            {isGeneratingMeta ? "Compiling..." : "Compile AI Code"}
                          </button>
                        </div>

                        {generatedPrompt && (
                          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between items-center">
                              <h3 className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Compiled Output</h3>
                              <button onClick={handleCopyPrompt} className="text-[10px] flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors text-slate-300 font-mono uppercase">
                                {copied ? <span className="text-green-400">✓ Acquired</span> : <span>📋 Copy</span>}
                              </button>
                            </div>
                            <div className="w-full p-3 bg-cyan-950/20 rounded text-cyan-300 border border-cyan-900/50 font-mono text-xs whitespace-pre-wrap shadow-inner">
                              {generatedPrompt}
                            </div>
                          </div>
                        )}

                        <div className="border-t border-slate-800 my-1"></div>

                        <div className={`flex flex-col gap-2 transition-opacity ${generatedPrompt ? 'opacity-100' : 'opacity-40'}`}>
                          <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="bg-green-900/50 text-green-200 px-2 py-0.5 rounded border border-green-800">PHASE 2</span> Execute Payload
                          </h3>
                          <textarea
                            className="w-full h-32 p-3 bg-slate-950 rounded border border-slate-700 text-green-300 outline-none focus:ring-1 focus:ring-green-500 font-mono text-sm resize-none shadow-inner disabled:opacity-50"
                            placeholder="Right-click and paste compiled code here..."
                            value={finalPromptInput}
                            onChange={(e) => setFinalPromptInput(e.target.value)}
                            disabled={inputLocked || !generatedPrompt}
                          // ANTI-CHEAT OVERRIDE: allow paste here
                          />
                        </div>
                      </div>
                    ) : (
                      <textarea
                        className="w-full grow p-4 bg-black/80 rounded border border-slate-700 text-slate-300 outline-none focus:border-cyan-700 focus:ring-1 focus:ring-cyan-500 font-mono text-sm resize-none min-h-[250px] shadow-[inset_0_0_30px_rgba(0,0,0,1)] disabled:opacity-50 transition-colors leading-relaxed"
                        placeholder="Draft code sequence... (Copy/Paste disabled)"
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        disabled={inputLocked}
                        onPaste={(e) => { e.preventDefault(); void reportViolation("COPY_PASTE"); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => e.preventDefault()}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    )}
                  </div>

                  {currentRoundData.type !== "CLASSIFY" && (
                    <button
                      type="button"
                      onClick={() => void submitPrompt()}
                      disabled={
                        inputLocked ||
                        (currentRoundData.type === "BONUS"
                          ? !metaPromptInput.trim() || !finalPromptInput.trim()
                          : !promptInput.trim())
                      }
                      className="bg-slate-800 hover:bg-cyan-900/50 border border-slate-700 hover:border-cyan-700 text-slate-400 hover:text-cyan-300 disabled:bg-black/50 disabled:border-slate-800 disabled:text-slate-700 p-4 rounded font-bold text-sm tracking-widest uppercase transition-all shadow-lg"
                    >
                      {lastResult?.passed ? "Lock Bypassed..." : busy ? "Transmitting..." : "Initiate Override"}
                    </button>
                  )}

                  {lastResult && (
                    <div className={`p-4 rounded border-l-4 transition-all duration-300 ${lastResult.passed ? "bg-green-950/30 border-green-500" : "bg-red-950/30 border-red-500"}`}>
                      <h3 className={`font-mono font-bold text-sm uppercase tracking-widest mb-1 ${lastResult.passed ? "text-green-500" : "text-red-500"}`}>
                        {lastResult.passed ? "✅ Override Successful" : "❌ Payload Rejected"}
                      </h3>
                      <div className="text-xs font-mono text-slate-400">Match Accuracy: {lastResult.score.toFixed(2)}%</div>
                    </div>
                  )}
                </div>
              </div>

              {currentRoundData.type !== "CLASSIFY" && (
                <div className="hidden md:flex w-12 bg-black/80 border border-slate-800 rounded flex-col justify-end items-center relative overflow-hidden shrink-0 shadow-[inset_0_0_20px_rgba(0,0,0,1)] py-4 min-h-[280px]">
                  <div className="absolute w-full h-[1px] bg-amber-500/50 z-10 shadow-[0_0_10px_rgba(245,158,11,1)]" style={{ bottom: `${getTargetScore(roundNumber)}%` }}>
                    <span className="absolute -top-5 right-1 text-[10px] font-mono text-amber-500">{getTargetScore(roundNumber)}</span>
                  </div>

                  <div
                    className={`w-full transition-all duration-1000 ease-out flex items-start justify-center pt-2 shadow-[0_-10px_20px_rgba(0,0,0,0.8)_inset] ${currentAccuracy >= getTargetScore(roundNumber) ? "bg-green-900/50" : "bg-cyan-900/30"}`}
                    style={{ height: `${currentAccuracy}%` }}
                  >
                    {currentAccuracy > 10 && (
                      <span className="text-[10px] font-mono font-bold text-slate-300 mt-1 drop-shadow-md">
                        {Math.round(currentAccuracy)}%
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-4 text-[10px] uppercase tracking-widest text-slate-600 rotate-180 font-bold font-mono" style={{ writingMode: "vertical-rl" }}>Match %</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------- FINISHED VIEW -------------------- */}
      {phase === "finished" && (
        <div className="text-center py-12 w-full max-w-2xl z-10">
          <h1 className="text-5xl font-black mb-8 font-mono text-transparent bg-clip-text bg-gradient-to-b from-slate-200 to-slate-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] tracking-tighter uppercase">
            Simulation<br />Terminated
          </h1>
          {message && (
            <p className="text-amber-500 font-mono tracking-widest uppercase text-sm mb-6 bg-amber-950/30 inline-block px-4 py-2 border border-amber-900/50 rounded">{message}</p>
          )}
          <div className="terminal-panel p-8 rounded-xl text-left border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
            <div className="screen-glare absolute inset-0 rounded-xl" />

            <div className="relative z-10">
              <h2 className="text-xl font-mono font-bold border-b border-cyan-900/50 pb-4 mb-6 text-cyan-400 flex items-center gap-3 uppercase tracking-widest">
                <span className="bg-cyan-500 w-2 h-2 rounded-full"></span> Debriefing Report
              </h2>
              <div className="space-y-4 font-mono text-sm">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-500 uppercase tracking-widest text-xs">Operative Identity</span>
                  <span className="font-bold text-slate-200">{player.name}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-500 uppercase tracking-widest text-xs">Sectors Cleared</span>
                  <span className="font-bold text-slate-200">{stats.roundsCompleted} / {TOTAL_ROUNDS}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-500 uppercase tracking-widest text-xs">Duration</span>
                  <span className="font-bold text-slate-200">{formatTime(totalSecondsUsed)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-500 uppercase tracking-widest text-xs">Violations</span>
                  <span className="font-bold text-slate-200">{violations} / 3</span>
                </div>
                <div className="flex justify-between items-center bg-cyan-950/20 p-4 rounded border border-cyan-900/30 mt-4 shadow-inner">
                  <span className="text-cyan-600 font-bold uppercase tracking-widest text-xs">Neural Precision</span>
                  <span className="text-cyan-400 font-black text-lg">
                    {stats.accuracies.length > 0 ? avgAccuracyPct.toFixed(1) : "0.0"}%
                  </span>
                </div>
              </div>

              <p className="mt-8 text-center text-[10px] text-slate-600 font-mono tracking-[0.2em] uppercase">
                {"// Uplink severed. Log recorded. //"}
              </p>
            </div>
          </div>

          {/* Leaderboard */}
          {leaderboardData.length > 0 && (() => {
            const playerRank = leaderboardData.findIndex(
              (p) => p.email === player.email || p.name === player.name
            );
            return (
              <div className="terminal-panel p-8 rounded-xl text-left border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative mt-8">
                <div className="screen-glare absolute inset-0 rounded-xl" />
                <div className="relative z-10">
                  <h2 className="text-xl font-mono font-bold border-b border-cyan-900/50 pb-4 mb-6 text-cyan-400 flex items-center gap-3 uppercase tracking-widest">
                    <span className="bg-cyan-500 w-2 h-2 rounded-full"></span> Global Operative Registry
                  </h2>

                  {playerRank >= 0 && (
                    <div className="flex justify-between items-center bg-amber-950/30 p-4 rounded border border-amber-900/40 mb-6">
                      <span className="text-amber-600 font-bold uppercase tracking-widest text-xs font-mono">Your Rank</span>
                      <span className="text-amber-400 font-black text-lg font-mono">#{playerRank + 1} of {leaderboardData.length}</span>
                    </div>
                  )}

                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    <div className="overflow-x-auto rounded border border-slate-800">
                      <table className="w-full text-left border-collapse font-mono text-sm">
                        <thead className="bg-slate-900/80 sticky top-0 z-10">
                          <tr className="border-b border-slate-700 text-cyan-600/70 text-xs uppercase tracking-widest">
                            <th className="p-3 font-bold w-10">#</th>
                            <th className="p-3 font-bold">Operative</th>
                            <th className="p-3 font-bold text-center">Sectors</th>
                            <th className="p-3 font-bold text-center">Duration</th>
                            <th className="p-3 font-bold text-center">Precision</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 bg-black/40">
                          {leaderboardData.map((p, idx) => {
                            const isMe = p.email === player.email || p.name === player.name;
                            const timeSec = p.completedAt && p.startedAt
                              ? Math.round((p.completedAt - p.startedAt) / 1000)
                              : 0;
                            return (
                              <tr
                                key={p.playerId}
                                className={
                                  isMe
                                    ? "bg-amber-950/30 border-l-2 border-l-amber-500"
                                    : "hover:bg-cyan-950/20 transition-colors"
                                }
                              >
                                <td className="p-3 text-cyan-800 font-bold">{String(idx + 1).padStart(2, "0")}</td>
                                <td className="p-3">
                                  <span className={isMe ? "text-amber-300 font-bold" : "text-slate-300 font-bold"}>
                                    {p.name}{isMe ? " (You)" : ""}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-400 text-center">{p.roundsPlayed}</td>
                                <td className="p-3 text-slate-400 text-center">{formatTime(timeSec)}</td>
                                <td className="p-3 text-green-500 font-bold text-center">{(p.averageScore * 100).toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
