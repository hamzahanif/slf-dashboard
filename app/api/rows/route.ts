import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { supabase } from "@/lib/supabase";
import { dbToRow } from "@/lib/supabase-rows";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    let query = supabase
      .from("entries")
      .select("*")
      .order("date", { ascending: false })
      .range(0, 14999);

    if (user.role === "va" && user.vaName) {
      query = query.ilike("va_name", user.vaName);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map(dbToRow);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
