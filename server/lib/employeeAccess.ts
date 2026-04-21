import { validateAdminCredentials } from "@/lib/admin";
import { connectDB } from "./mongodb";

type EmployeeDirectoryRecord = {
  empName?: string;
  empMail?: string;
};

const DEFAULT_COMPANY_EMAIL_DOMAIN = "calfus.com";
const DEFAULT_EMPLOYEE_DB_NAME = "promptwars";
const DEFAULT_EMPLOYEE_COLLECTION_NAME = "employeeDetails";
const DEFAULT_ATTEMPT_GAME_BYPASS_LOCAL_PART = "attempt-game";

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
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
  return (
    process.env.EMPLOYEE_DB_NAME?.trim() || DEFAULT_EMPLOYEE_DB_NAME
  );
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
    { empMail: emailMatcher },
    {
      projection: {
        _id: 0,
        empName: 1,
        empMail: 1,
      },
    }
  )) as EmployeeDirectoryRecord | null;

  return record?.empMail ? record : null;
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
    if (
      !employee?.empName ||
      normalizeName(employee.empName) !== normalizeName(trimmedName)
    ) {
      return {
        ok: false,
        error: "This name and email pair does not match the employee directory.",
      };
    }

    return { ok: true, isAdmin: false };
  } catch (error) {
    console.error("[employeeAccess] employee directory lookup failed:", error);
    return {
      ok: false,
      error: "Employee directory verification is unavailable. Please try again.",
    };
  }
}
