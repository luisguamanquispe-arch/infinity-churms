"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, COLORS } from "@/lib/constants";
import { LayoutDashboard, FileMinus, BarChart3, LogOut, Users, Settings, Menu } from "lucide-react";
import { useState } from "react";
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
  buildVersion,
}: {
  children: React.ReactNode;
  user?: { name: string; role: UserRole };
  nav?: NavItem[];
  buildVersion?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
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
    <div className="flex min-h-screen bg-slate-50" style={{ backgroundColor: "#f8fafc" }}>
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
        <div className="mt-auto space-y-2">
          {buildVersion && (
            <p className="px-3 text-[10px] text-slate-500" title={buildVersion}>
              v{buildVersion.slice(0, 7)}
            </p>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-[#0B1F3A] p-4 text-white">
            <p className="text-sm font-bold">{APP_NAME}</p>
            <nav className="mt-6 space-y-1">
              {items.map((item) => {
                const Icon = ICONS[item.href] ?? LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
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
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
          <div>
            <p className="text-sm font-bold text-[#0B1F3A]">{APP_NAME}</p>
            {user && <p className="text-xs text-slate-500">{user.name}</p>}
          </div>
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border p-2 text-[#0B1F3A]"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 bg-slate-50 p-4 md:p-8" style={{ backgroundColor: "#f8fafc" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
