import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import GroupsClient from "./GroupsClient";

export default async function GroupsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <GroupsClient user={user} />;
}
