import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Gestión de bajas y recuperación de equipos — Infinity ISP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" style={{ colorScheme: "light" }}>
      <body
        className="min-h-screen bg-slate-50 text-slate-900 antialiased"
        style={{ backgroundColor: "#f8fafc", color: "#0f172a" }}
      >
        {children}
      </body>
    </html>
  );
}
