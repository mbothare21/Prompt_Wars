// /lib/openai.ts
import { loadEnvConfig } from "@next/env";
import OpenAI from "openai";
import path from "path";

let client: OpenAI | undefined;
let envTried = false;

/**
 * Load .env / .env.local from common locations so OPENAI_API_KEY is available
 * even if the process cwd or Next’s load order differs (e.g. monorepo root).
 */
function ensureOpenAIEnvLoaded() {
  if (envTried) return;
  envTried = true;

  const cwd = process.cwd();
  loadEnvConfig(cwd);
  loadEnvConfig(path.join(cwd, "backend"));
  if (path.basename(cwd) === "backend") {
    loadEnvConfig(path.join(cwd, ".."));
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
  }
}

/** Lazy client so Next.js build does not require OPENAI_API_KEY at import time. */
export function getOpenAI(): OpenAI {
  if (!client) {
    ensureOpenAIEnvLoaded();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        [
          "OPENAI_API_KEY is not set or is empty.",
          "Add to backend/.env or backend/.env.local (same folder as package.json):",
          "  OPENAI_API_KEY=sk-...",
          "Restart `npm run dev` after saving. If the key is in the parent folder, copy it into backend/.env.",
        ].join(" ")
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}
