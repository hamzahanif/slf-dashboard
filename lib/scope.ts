import type { SessionPayload } from "./session";

interface Row {
  [key: string]: string;
}

// Admins see every row. VAs only see rows attributed to their own name.
export function scopeRowsToUser<T extends Row>(rows: T[], user: SessionPayload): T[] {
  if (user.role === "admin" || !user.vaName) return rows;
  const target = user.vaName.trim().toLowerCase();
  return rows.filter(r => (r["VA Name"] ?? "").trim().toLowerCase() === target);
}
