// All sheets live in the same Google Spreadsheet.
// gid is the numeric tab ID from the URL (?gid=XXXXXX)

export interface SheetConfig {
  spreadsheetId: string;
  gid: string;
  vaName: string;
}

const SPREADSHEET_ID = "1xZB7PxbX4Nk3CxiwmZM2ci43NenT-_NmLr2brN2aFr8";

export const VA_SHEETS: SheetConfig[] = [
  { spreadsheetId: SPREADSHEET_ID, gid: "1730653357", vaName: "Micro Real" },
  { spreadsheetId: SPREADSHEET_ID, gid: "630411343",  vaName: "Muhammad Salman" },
  { spreadsheetId: SPREADSHEET_ID, gid: "2130409079", vaName: "Abdul Rehman" },
  { spreadsheetId: SPREADSHEET_ID, gid: "565316392",  vaName: "Fazeela" },
];

export const QA_TRACKER: SheetConfig = {
  spreadsheetId: SPREADSHEET_ID,
  gid: "471911800",
  vaName: "QA Tracker",
};
