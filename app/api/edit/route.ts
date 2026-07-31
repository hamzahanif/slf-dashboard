import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { supabase } from "@/lib/supabase";
import { rowFieldsToDb } from "@/lib/supabase-rows";
import type { SessionPayload } from "@/lib/session";

/**
 * Authorise a write against a specific row.
 *
 * The owning VA is read from the DATABASE, never from the request body — a
 * caller could otherwise pass another VA's row id alongside their own name and
 * pass the check. Admins may act on any row; a VA only on their own.
 */
async function authorizeRow(user: SessionPayload, id: string) {
  const { data, error } = await supabase
    .from("entries").select("id, va_name, facility_name, date").eq("id", id).maybeSingle();

  if (error) return { status: 500 as const, message: error.message };
  if (!data) return { status: 404 as const, message: "Entry not found" };

  if (user.role !== "admin") {
    const owner = String(data.va_name ?? "").trim().toLowerCase();
    const mine = (user.vaName ?? "").trim().toLowerCase();
    if (!mine || owner !== mine) {
      return { status: 403 as const, message: "You can only change your own entries" };
    }
  }
  return { status: 200 as const, row: data };
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id, updates } = await req.json() as { id: string; updates: Record<string, string> };
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const auth = await authorizeRow(user, id);
    if (auth.status !== 200) return NextResponse.json({ error: auth.message }, { status: auth.status });

    const dbUpdates = rowFieldsToDb(updates ?? {});
    if (Object.keys(dbUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }
    // A VA must not be able to reassign a row to someone else.
    if (user.role !== "admin") delete dbUpdates.va_name;

    const { error } = await supabase.from("entries").update(dbUpdates).eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[edit]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const auth = await authorizeRow(user, id);
    if (auth.status !== 200) return NextResponse.json({ error: auth.message }, { status: auth.status });

    // Soft delete: the row is hidden from every read but stays recoverable.
    const { error } = await supabase
      .from("entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);

    if (error) {
      // Refuse rather than fall back to a permanent delete — removing a row
      // while the user believes it is recoverable is the worst outcome here.
      if (/deleted_at|schema cache|column/i.test(error.message)) {
        return NextResponse.json({
          error: "Delete is disabled until the database is migrated. Run supabase/entries_add_deleted_at.sql in the Supabase SQL editor.",
        }, { status: 501 });
      }
      throw new Error(error.message);
    }

    console.log(`[delete] ${user.name} (${user.role}) removed entry ${id}` +
      ` — ${auth.row.date} / ${auth.row.va_name} / ${auth.row.facility_name}`);

    return NextResponse.json({ ok: true, deleted: auth.row });
  } catch (err) {
    console.error("[delete]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
