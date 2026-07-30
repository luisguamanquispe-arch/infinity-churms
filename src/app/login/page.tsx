"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@infinity.net");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError("Credenciales inválidas");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      style={{ backgroundColor: "#f8fafc" }}
    >
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#0B1F3A]">Infinity — Bajas</h1>
        <p className="mt-1 text-sm text-slate-500">Gestión de bajas y equipos</p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Correo"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Contraseña"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: COLORS.brand }}
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-400">admin@infinity.net / admin2010 · supervisor@infinity.net / admin2010</p>
      </form>
    </div>
  );
}
