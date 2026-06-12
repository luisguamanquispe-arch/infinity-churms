import { AppShell } from "@/components/layout/app-shell";
import { getSession } from "@/lib/auth";
import { hasPermission, NAV_ITEMS } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const nav = NAV_ITEMS.filter((item) => hasPermission(session.role, item.permission)).map(
    ({ href, label }) => ({ href, label })
  );

  return (
    <AppShell user={{ name: session.name, role: session.role }} nav={nav}>
      {children}
    </AppShell>
  );
}
