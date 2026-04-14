import { validateAdminCredentials, createAdminToken } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let name = "";
  let email = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.name === "string") name = body.name.trim();
    if (typeof body.email === "string") email = body.email.trim();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!validateAdminCredentials(name, email)) {
    return Response.json({ error: "Invalid admin credentials" }, { status: 401 });
  }

  const token = createAdminToken(name);
  return Response.json({ token });
}
