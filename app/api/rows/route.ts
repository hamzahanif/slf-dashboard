import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { fetchAllEntries } from "@/lib/supabase";
import { dbToRow } from "@/lib/supabase-rows";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const data = await fetchAllEntries({
      excludeQATracker: true,
      vaName: user.role === "va" && user.vaName ? user.vaName : undefined,
    });

    const rows = data.map(dbToRow);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
