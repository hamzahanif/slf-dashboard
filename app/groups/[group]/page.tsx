import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import GroupDetailClient from "./GroupDetailClient";

export default async function GroupDetailPage({ params }: { params: Promise<{ group: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { group } = await params;
  return <GroupDetailClient user={user} groupName={decodeURIComponent(group)} />;
}
