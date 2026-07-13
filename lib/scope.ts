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

// Merge QA tracker rows + VA sheet rows, removing exact duplicates.
// Each row is tagged with _sourceGid so edits go to the right sheet tab.
// Duplicate key: Date + VA Name + Direct Facebook Post URL (case-insensitive).
// Rows without a URL fall back to Date + VA Name + Facility Name.
export function mergeAndDeduplicate(
  qaRows: Row[],
  vaRows: Row[],
  vaSheetGids?: { gid: string; vaName: string }[],
  qaGid?: string
): Row[] {
  const key = (r: Row): string => {
    const url = (r["Direct Facebook Post URL"] ?? "").trim().toLowerCase();
    const suffix = url || (r["Facility Name"] ?? "").trim().toLowerCase();
    return [
      (r["Date"] ?? "").trim(),
      (r["VA Name"] ?? "").trim().toLowerCase(),
      suffix,
    ].join("||");
  };

  const seen = new Set<string>();
  const result: Row[] = [];

  // VA sheet rows take precedence (source of truth going forward)
  for (const r of vaRows) {
    const k = key(r);
    if (!seen.has(k)) {
      seen.add(k);
      // Tag with the gid of the VA's sheet
      const vaName = (r["VA Name"] ?? "").trim().toLowerCase();
      const sourceGid = vaSheetGids?.find(
        s => s.vaName.trim().toLowerCase() === vaName
      )?.gid ?? "";
      result.push({ ...r, _sourceGid: sourceGid });
    }
  }
  // Add QA tracker rows not already represented
  for (const r of qaRows) {
    const k = key(r);
    if (!seen.has(k)) {
      seen.add(k);
      result.push({ ...r, _sourceGid: qaGid ?? "" });
    }
  }

  return result;
}
