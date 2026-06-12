"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, COLORS } from "@/lib/constants";
import { LayoutDashboard, FileMinus, BarChart3, LogOut, Users, Settings } from "lucide-react";
import type { UserRole } from "@prisma/client";

const ICONS: Record<string, typeof LayoutDashboard> = {
  "/": LayoutDashboard,
  "/bajas": FileMinus,
  "/clientes": Users,
  "/reportes": BarChart3,
  "/configuracion": Settings,
};

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  COBRANZAS: "Cobranzas",
  TECNICO: "Técnico",
  SUPERVISOR: "Supervisor",
};

interface NavItem {
  href: string;
  label: string;
}

export function AppShell({
  children,
  user,
  nav,
}: {
  children: React.ReactNode;
  user?: { name: string; role: UserRole };
  nav?: NavItem[];
}) {
  const pathname = usePathname();
  const items = nav ?? [
    { href: "/", label: "Dashboard" },
    { href: "/bajas", label: "Bajas" },
    { href: "/reportes", label: "Reportes" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-col bg-[#0B1F3A] p-4 text-white md:flex">
        <p className="text-sm font-bold">{APP_NAME}</p>
        {user && (
          <p className="mt-2 text-xs text-slate-400">
            {user.name}
            <br />
            <span style={{ color: COLORS.brand }}>{ROLE_LABELS[user.role]}</span>
          </p>
        )}
        <nav className="mt-8 space-y-1">
          {items.map((item) => {
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
