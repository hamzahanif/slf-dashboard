import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import DashboardClient from "./DashboardClient";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <DashboardClient user={user} />;
}
