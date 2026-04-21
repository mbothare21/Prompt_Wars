import { validateAdminCredentials } from "@/lib/admin";

type AllowedEmployee = {
  name: string;
  email: string;
};

const DEFAULT_COMPANY_EMAIL_DOMAIN = "prompt.com";

// Add approved employee name/email pairs here when you want strict identity matching.
const APPROVED_EMPLOYEES: AllowedEmployee[] = [
  // { name: "Jane Doe", email: "jane.doe@prompt.com" },
];

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

function parseEnvAllowlist(): AllowedEmployee[] {
  const raw = process.env.ALLOWED_EMPLOYEES_JSON;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];

      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.name !== "string" ||
        !candidate.name.trim() ||
        typeof candidate.email !== "string" ||
        !candidate.email.trim()
      ) {
        return [];
      }

      return [
        {
          name: candidate.name.trim(),
          email: candidate.email.trim(),
        },
      ];
    });
  } catch {
    return [];
  }
}

function getApprovedEmployees() {
  return [...APPROVED_EMPLOYEES, ...parseEnvAllowlist()];
}

export function validateEmployeeIdentity(name: string, email?: string) {
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

  const companyDomain = getCompanyEmailDomain();
  if (companyDomain && !normalizeEmail(trimmedEmail).endsWith(`@${companyDomain}`)) {
    return {
      ok: false,
      error: `Use your approved @${companyDomain} company email.`,
    };
  }

  const approvedEmployees = getApprovedEmployees();
  if (approvedEmployees.length === 0) {
    return { ok: true, isAdmin: false };
  }

  const isApproved = approvedEmployees.some(
    (employee) =>
      normalizeName(employee.name) === normalizeName(trimmedName) &&
      normalizeEmail(employee.email) === normalizeEmail(trimmedEmail)
  );

  if (!isApproved) {
    return {
      ok: false,
      error: "This name and email pair is not on the approved employee list.",
    };
  }

  return { ok: true, isAdmin: false };
}
