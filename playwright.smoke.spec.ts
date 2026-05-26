import { expect, test, type Page } from "@playwright/test";

function makePlayerReport(email: string) {
  return {
    name: "Test Player",
    email,
    location: "US",
    roundsPlayed: 2,
    timeTaken: 91_000,
    avgAccuracy: 0.78,
    attemptsTaken: 3,
    gameStatus: "COMPLETED",
    rounds: [
      {
        round: 1,
        attempts: 2,
        score: 0.4,
        prompt: { role: "tester", intent: "classify" },
        output: "Round 1 output",
      },
      {
        round: 2,
        attempts: 1,
        score: 0.78,
        prompt: "Write a concise improvement prompt.",
        output: "Round 2 output",
      },
    ],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

async function mockGameApis(page: Page, classifyForceAdvance = false) {
  let roundIndex = 1;
  let evaluateCalls = 0;

  await page.route("**/api/start-game", async (route) => {
    await route.fulfill({
      json: {
        status: "NEW_GAME",
        sessionId: "session-123",
        startTime: Date.now(),
        timeLimit: 120_000,
        remainingTime: 120_000,
      },
    });
  });

  await page.route("**/api/get-round", async (route) => {
    const payload =
      roundIndex === 1
        ? {
            status: "ACTIVE",
            roundNumber: 1,
            roundType: "CLASSIFY",
            instruction: "Classify each section using the dropdowns.",
            originalPrompt: null,
            input: "System prompt blocks are shown below.",
            referenceExample: null,
            expectedOutput: null,
            constraints: { requiredSections: ["A", "B"] },
            promptParts: [
              {
                id: "part-a",
                text: "Block A: You are a senior analyst.",
                answer: "Role Prompting",
                options: ["Role Prompting", "Few-Shot Prompting", "Zero-Shot Prompting"],
              },
              {
                id: "part-b",
                text: "Block B: Example input-output pairs are provided.",
                answer: "Few-Shot Prompting",
                options: ["Role Prompting", "Few-Shot Prompting", "Output Constraints"],
              },
            ],
            attemptsThisRound: 0,
            maxAttemptsThisRound: 2,
            remainingTime: 120_000,
          }
        : {
            status: "ACTIVE",
            roundNumber: 2,
            roundType: "IMPROVE",
            instruction: "Improve the prompt while keeping it concise.",
            originalPrompt: "Draft a better prompt for the task.",
            input: "Task input for round 2.",
            referenceExample: null,
            expectedOutput: null,
            constraints: { maxWords: 40, requiredSections: ["Goal", "Constraints"] },
            promptParts: null,
            attemptsThisRound: 0,
            maxAttemptsThisRound: 3,
            remainingTime: 119_000,
          };

    await route.fulfill({ json: payload });
  });

  await page.route("**/api/evaluate", async (route) => {
    evaluateCalls += 1;

    if (!classifyForceAdvance && evaluateCalls === 1) {
      await route.fulfill({
        json: {
          status: "ROUND_FAILED",
          finalScore: 0.4,
          attemptsThisRound: 1,
          attemptsRemaining: 1,
          output: "First attempt output",
          remainingTime: 118_500,
        },
      });
      return;
    }

    roundIndex = 2;
    await route.fulfill({
      json: {
        status: "ROUND_FORCE_ADVANCED",
        finalScore: 0.4,
        attemptsThisRound: 2,
        attemptsRemaining: 0,
        output: "Forced advance output",
        remainingTime: 118_000,
      },
      });
  });

  await page.route("**/api/leaderboard**", async (route) => {
    await route.fulfill({
      json: {
        leaderboard: [
          {
            playerId: "session-123",
            name: "Test Player",
            email: "attempt-game@calfus.com",
            roundsPlayed: 2,
            startedAt: Date.now() - 91_000,
            completedAt: Date.now(),
            averageScore: 0.78,
          },
        ],
      },
    });
  });

  await page.route("**/api/player-report**", async (route) => {
    await route.fulfill({
      json: {
        player: makePlayerReport("attempt-game@calfus.com"),
        tips: { 1: "Focus on the section labels." },
      },
    });
  });

  await page.route("**/api/admin/login", async (route) => {
    await route.fulfill({
      json: {
        token: "admin-token",
      },
    });
  });

  await page.route("**/api/admin/leaderboard**", async (route) => {
    await route.fulfill({
      json: {
        players: [
          {
            playerId: "p-1",
            name: "Test Player",
            email: "test.player@calfus.com",
            location: "US",
            roundsPlayed: 2,
            timeTakenSec: 91,
            averageScore: 0.78,
            attemptsUsed: 3,
            completed: true,
            gameStatus: "COMPLETED",
          },
        ],
      },
    });
  });

  await page.route("**/api/admin/player-responses**", async (route) => {
    await route.fulfill({
      json: {
        player: makePlayerReport("test.player@calfus.com"),
        tips: { 1: "Use the technique labels exactly." },
      },
    });
  });
}

async function goToRegister(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Enter" })).toBeVisible();
  await page.getByRole("button", { name: "Enter" }).click();
  await page.getByRole("button", { name: "View Rules" }).click();
  await page.getByRole("button", { name: "Accept Terms" }).click();
  await expect(page.getByRole("heading", { name: "Player Login" })).toBeVisible();
}

test("player flow advances after forced exhaustion", async ({ page }) => {
  await mockGameApis(page);
  await goToRegister(page);

  await page.locator('input[type="text"]').first().fill("Test Player");
  await page.locator('input[type="email"]').first().fill("attempt-game@calfus.com");
  await page.getByRole("button", { name: "Start Game" }).click();

  await expect(page.getByRole("heading", { name: "Interface Overview" })).toBeVisible();
  await page.getByRole("button", { name: "I'm Ready — Start Timer →" }).click();
  await expect(page.getByRole("heading", { name: "Classify Each Section" })).toBeVisible();
  const selects = page.locator("select");
  await expect(selects).toHaveCount(2);
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 1 });

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();

  await page.evaluate(() => {
    const submitButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Submit"
    ) as HTMLButtonElement | undefined;
    submitButton?.click();
  });
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await page.getByRole("button", { name: "Next Round →" }).click();
  await expect(page.getByRole("heading", { name: /Round 2 of 6/i })).toBeVisible();
  await expect(page.getByText("Improve the prompt while keeping it concise.")).toBeVisible();
});

test("classify force-advance shows the result modal", async ({ page }) => {
  await mockGameApis(page, true);
  await goToRegister(page);

  await page.locator('input[type="text"]').first().fill("Test Player");
  await page.locator('input[type="email"]').first().fill("attempt-game@calfus.com");
  await page.getByRole("button", { name: "Start Game" }).click();

  await expect(page.getByRole("heading", { name: "Interface Overview" })).toBeVisible();
  await page.getByRole("button", { name: "I'm Ready — Start Timer →" }).click();
  await expect(page.getByRole("heading", { name: "Classify Each Section" })).toBeVisible();

  const selects = page.locator("select");
  await expect(selects).toHaveCount(2);
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 1 });

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await page.getByRole("button", { name: "Next Round →" }).click();

  await expect(page.getByRole("heading", { name: /Round 2 of 6/i })).toBeVisible();
});

test("finished screen downloads the self report", async ({ page }) => {
  await mockGameApis(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "escapeRoom_state",
      JSON.stringify({
        phase: "finished",
        player: { name: "Test Player", email: "attempt-game@calfus.com" },
        sessionId: "session-123",
        roundNumber: 2,
        stats: {
          roundsCompleted: 2,
          accuracies: [0.4, 0.78],
          attemptsPerRound: { 1: 2, 2: 1 },
          terminalStatus: "COMPLETED",
          bonusCompleted: false,
          lastFinalScore: 0.78,
          highScoreBonus: false,
        },
        violations: 0,
        initialSessionSeconds: 120,
        gameEndedSecondsUsed: 91,
        promptInput: "",
        metaPromptInput: "",
        generatedPrompt: null,
        dropdownSelections: {},
      })
    );
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Game Over" })).toBeVisible();
  await expect(page.getByText("Cross-Round Coaching")).toBeVisible();
  await expect(page.getByRole("button", { name: /Download My Report/i })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download My Report/i }).click();
  const download = await downloadPromise;
  await expect(download.suggestedFilename()).toBe("attempt-game-calfus-com-prompt-wars-response-report.html");
});

test("admin can view leaderboard and download player responses", async ({ page }) => {
  await mockGameApis(page);
  await goToRegister(page);

  await page.locator('input[type="text"]').first().fill("admin");
  await page.locator('input[type="email"]').first().fill("admin@prompt.com");
  await page.getByRole("button", { name: "Start Game" }).click();

  await expect(page.getByRole("heading", { name: "Admin Terminal" })).toBeVisible();
  await page.getByRole("button", { name: "Players" }).click();
  await expect(page.getByText("Test Player")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  await expect(download.suggestedFilename()).toBe("test-player-calfus-com-prompt-wars-response-report.html");
});
