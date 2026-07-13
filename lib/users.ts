export type Role = "admin" | "va";

export interface AppUser {
  username: string;
  passwordHash: string;
  role: Role;
  name: string;
  title: string;
  // For role "va", this must match the "VA Name" column value in the sheet.
  vaName: string | null;
}

// Passwords are bcrypt-hashed — the plaintext was generated once and shared
// with each person directly. Nobody, including this file, stores it in the clear.
export const USERS: AppUser[] = [
  { username: "hamza", passwordHash: "$2b$10$E2i1pyEnMAUrwXK4ra1E6.g2W9tZhxx9nq3DX0aI0ouXNGAf1QZMy", role: "admin", name: "Hamza", title: "QA Manager", vaName: null },
  { username: "jack", passwordHash: "$2b$10$Ro0WRjT.0FltVUyqXikLdOQIptve43DvR/725/lA1hhJle5Z5NBUu", role: "admin", name: "Jack", title: "CEO", vaName: null },
  { username: "salman", passwordHash: "$2b$10$dVVBmlXzevkoU1y0ag488.YH2bTnnJXy.DxsqxDfv6r.CsF.vBhlG", role: "va", name: "Muhammad Salman", title: "VA", vaName: "Muhammad Salman" },
  { username: "abdulrehman", passwordHash: "$2b$10$9wu0iUXAxXvag5F5COiSOueWuODzuRSr.Zxf5/7SnyiilmS0SYV4q", role: "va", name: "Abdul Rehman", title: "VA", vaName: "Abdul Rehman" },
  { username: "micro", passwordHash: "$2b$10$nKjx/U/BHQHlmRgHN10bweguXsva/EWeMw9awlVE5QtJEWneermbK", role: "va", name: "Micro Real", title: "VA", vaName: "Mico Real" },
  { username: "fazeela", passwordHash: "$2b$10$OlVVRKrWEl.dG1UC/9IEVeIkXeIn1P/sj5.uzlOVpHFJCo.4jn94u", role: "va", name: "Fazeela", title: "VA", vaName: "Fazeela" },
];

export function findUser(username: string): AppUser | undefined {
  return USERS.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
}
