import crypto from "crypto";

const ADMIN_NAME = process.env.ADMIN_NAME || "admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@prompt.com";
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function validateAdminCredentials(name: string, email: string) {
  return normalize(name) === normalize(ADMIN_NAME) && normalize(email) === normalize(ADMIN_EMAIL);
}

function base64url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createAdminToken(username: string) {
  const payload = {
    u: username,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const payloadStr = JSON.stringify(payload);
  const sig = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(payloadStr)
    .digest("base64url");

  return `${base64url(payloadStr)}.${sig}`;
}

export function verifyAdminToken(token?: string) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  try {
    const payloadStr = Buffer.from(parts[0], "base64").toString("utf8");
    const expectedSig = crypto
      .createHmac("sha256", TOKEN_SECRET)
      .update(payloadStr)
      .digest("base64url");

    if (expectedSig !== parts[1]) return false;

    const payload = JSON.parse(payloadStr) as { exp: number };
    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}
