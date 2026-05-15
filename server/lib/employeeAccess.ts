import { validateAdminCredentials } from "@/lib/admin";
import { connectDB } from "./mongodb";

type EmployeeDirectoryRecord = {
  Name?: string;
  Email?: string;
  Location?: string;
};

const DEFAULT_COMPANY_EMAIL_DOMAIN = "calfus.com";
const DEFAULT_EMPLOYEE_DB_NAME = "promptwars";
const DEFAULT_EMPLOYEE_COLLECTION_NAME = "employeeDetails";
const DEFAULT_ATTEMPT_GAME_BYPASS_LOCAL_PART = "attempt-game";

function normalizeName(name: string): string {
  // Decompose accented characters (NFD), then filter out all combining marks
  // (U+0300–U+036F) so é→e, ñ→n, etc. — without embedding raw Unicode in source.
  const noDiacritics = Array.from(name.trim().toLowerCase().normalize("NFD"))
    .filter((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp < 0x0300 || cp > 0x036f;
    })
    .join("");
  return noDiacritics
    .replace(/['''ʼ`]/g, "") // O'Brien → OBrien
    .replace(/\./g, "")      // Jr.→Jr, A.→A
    .replace(/-/g, " ")      // Mary-Jane → Mary Jane
    .replace(/\s+/g, " ")
    .trim();
}

// Returns true if the name the user typed plausibly matches the DB name.
// Allows middle names/initials stored in the DB to be omitted by the user,
// while still requiring first word and last word to match exactly.
function namesMatch(dbName: string, inputName: string): boolean {
  const db = normalizeName(dbName);
  const input = normalizeName(inputName);

  if (db === input) return true;

  const dbWords = db.split(" ").filter(Boolean);
  const inputWords = input.split(" ").filter(Boolean);
  if (inputWords.length < 2 || dbWords.length < 2) return false;

  const dbWordSet = new Set(dbWords);
  return (
    dbWords[0] === inputWords[0] &&
    dbWords[dbWords.length - 1] === inputWords[inputWords.length - 1] &&
    inputWords.every((w) => dbWordSet.has(w))
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getCompanyEmailDomain() {
  return (process.env.COMPANY_EMAIL_DOMAIN || DEFAULT_COMPANY_EMAIL_DOMAIN)
    .trim()
    .toLowerCase();
}

function getEmployeeDbName() {
  return process.env.EMPLOYEE_DB_NAME?.trim() || DEFAULT_EMPLOYEE_DB_NAME;
}

function getEmployeeCollectionName() {
  return (
    process.env.EMPLOYEE_COLLECTION_NAME?.trim() ||
    DEFAULT_EMPLOYEE_COLLECTION_NAME
  );
}

function getAttemptGameBypassEmail() {
  return (
    process.env.ATTEMPT_GAME_BYPASS_EMAIL?.trim() ||
    `${DEFAULT_ATTEMPT_GAME_BYPASS_LOCAL_PART}@${getCompanyEmailDomain()}`
  );
}

export function isAttemptGameBypassEmail(email?: string) {
  if (!email) return false;
  return normalizeEmail(email) === normalizeEmail(getAttemptGameBypassEmail());
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findEmployeeRecordByEmail(
  email: string
): Promise<EmployeeDirectoryRecord | null> {
  const conn = await connectDB();
  if (!conn) {
    throw new Error("MongoDB unavailable");
  }

  const employeeDbName = getEmployeeDbName();
  const employeeCollectionName = getEmployeeCollectionName();
  const db = conn.connection.getClient().db(employeeDbName);
  const emailMatcher = new RegExp(`^${escapeRegex(email)}$`, "i");
  const record = (await db.collection(employeeCollectionName).findOne(
    { Email: emailMatcher },
    {
      projection: {
        _id: 0,
        Name: 1,
        Email: 1,
        Location: 1,
      },
    }
  )) as EmployeeDirectoryRecord | null;

  return record?.Email ? record : null;
}

export async function validateEmployeeIdentity(name: string, email?: string) {
  const trimmedName = name.trim();
  const trimmedEmail = email?.trim() ?? "";

  if (!trimmedName || !trimmedEmail) {
    return {
      ok: false,
      error: "Please enter your full name and company email.",
    };
  }

  if (validateAdminCredentials(trimmedName, trimmedEmail)) {
    return { ok: true, isAdmin: true };
  }

  if (isAttemptGameBypassEmail(trimmedEmail)) {
    return { ok: true, isAdmin: false, isAttemptGameBypass: true };
  }

  const companyDomain = getCompanyEmailDomain();
  if (companyDomain && !normalizeEmail(trimmedEmail).endsWith(`@${companyDomain}`)) {
    return {
      ok: false,
      error: `Use your approved @${companyDomain} company email.`,
    };
  }

  try {
    const employee = await findEmployeeRecordByEmail(trimmedEmail);
    if (!employee?.Name || !namesMatch(employee.Name, trimmedName)) {
      return {
        ok: false,
        error: "This name and email pair does not match the employee directory.",
      };
    }

    return { ok: true, isAdmin: false, location: employee.Location };
  } catch (error) {
    console.error("[employeeAccess] employee directory lookup failed:", error);
    return {
      ok: false,
      error: "Employee directory verification is unavailable. Please try again.",
    };
  }
}
