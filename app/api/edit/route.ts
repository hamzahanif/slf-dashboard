import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { supabase } from "@/lib/supabase";
import { rowFieldsToDb } from "@/lib/supabase-rows";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json() as {
      id: string;
      vaName: string;
      updates: Record<string, string>;
    };

    const { id, vaName, updates } = body;

    if (!id || !vaName) {
      return NextResponse.json({ error: "id and vaName are required" }, { status: 400 });
    }

    // VAs may only edit their own rows
    if (user.role === "va" && user.vaName?.toLowerCase() !== vaName.toLowerCase()) {
      return NextResponse.json({ error: "Not authorized to edit another VA's rows" }, { status: 403 });
    }

    const dbUpdates = rowFieldsToDb(updates);
    if (Object.keys(dbUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("entries")
      .update(dbUpdates)
      .eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[edit]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
