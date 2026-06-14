import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-session";
import { defaultHomePathForRole } from "@/lib/role-policy";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(defaultHomePathForRole(user.role));
  redirect("/dashboard");
}
