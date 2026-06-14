import { redirect } from "next/navigation";

export default function FinanceReportsRedirect() {
  redirect("/finance?range=month");
}
