// Add each VA's sheet here. sheetName must match the tab name in Google Sheets exactly.
// qaTracker is the shared QA Daily Tracker sheet.

export interface SheetConfig {
  id: string;       // Google Spreadsheet ID
  sheetName: string; // Tab name inside that spreadsheet
  vaName: string;   // Display name
}

export const VA_SHEETS: SheetConfig[] = [
  // Example — replace with real sheet IDs and tab names:
  // { id: "1xZB7PxbX4Nk3CxiwmZM2ci43NenT-_NmLr2brN2aFr8", sheetName: "Sheet1", vaName: "VA 1" },
];

export const QA_TRACKER: SheetConfig = {
  id: "1xZB7PxbX4Nk3CxiwmZM2ci43NenT-_NmLr2brN2aFr8",
  sheetName: "QA Daily Tracker",
  vaName: "QA Tracker",
};

// Column index map for VA per-person sheets (0-based)
export const VA_COLS = {
  date: 0,
  vaName: 1,
  shift: 2,
  fbGroup: 3,
  fbPostUrl: 4,
  facilityName: 5,
  slfListingId: 6,
  mediaUploaded: 7,
  commentA: 8,
  actionType: 9,
  promoComment: 10,
  handoffNotes: 11,
  wpPostTime: 12,
  fbAccount: 13,
};

// Column index map for QA Daily Tracker
export const QA_COLS = {
  date: 0,
  vaName: 1,
  shift: 2,
  fbGroup: 3,
  fbPostUrl: 4,
  facilityName: 5,
  slfListingId: 6,
  mediaUploaded: 7,
  commentA: 8,
  actionType: 9,
  promoComment: 10,
  handoffNotes: 11,
  wpPostTime: 12,
  statusNotes: 13,
  attachment: 14,
};
