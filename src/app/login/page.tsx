"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { APP_SHORT_NAME, COLORS } from "@/lib/constants";
import { InfinityLogo } from "@/components/brand/infinity-logo";

function safeRedirectPath(from: string | null) {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/";
  return from;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
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
      window.location.href = safeRedirectPath(searchParams.get("from"));
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
        <div className="mb-6 flex justify-center">
          <InfinityLogo variant="compact" priority />
        </div>
        <p className="text-center text-sm font-medium text-[#0B1F3A]">{APP_SHORT_NAME}</p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Usuario (correo)"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Clave"
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
      </form>
    </div>
  );
}

function LoginLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      style={{ backgroundColor: "#f8fafc", color: "#0f172a" }}
    >
      <div className="text-center">
        <InfinityLogo variant="compact" className="mx-auto" priority />
        <div
          className="mx-auto mt-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#00A9B5]"
          aria-hidden
        />
        <p className="mt-4 text-sm font-medium text-[#0B1F3A]">Cargando acceso…</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
