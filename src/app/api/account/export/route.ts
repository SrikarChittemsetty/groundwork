import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { buildExport } from "@/lib/exportAccount";

// Full, user-initiated export: decrypted, readable JSON, everything of yours.
// The payload itself is built in buildExport() so the tests can check that it
// still covers every kind of entry the app can create.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await buildExport(userId);
  if (!payload) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="values-mirror-export.json"',
    },
  });
}
