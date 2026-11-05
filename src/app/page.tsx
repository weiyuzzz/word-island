import { DashboardView } from "@/components/dashboard-view";
import { getDashboard } from "@/server/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboard();
  return <DashboardView data={data} />;
}
