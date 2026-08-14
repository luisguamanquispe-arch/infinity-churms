"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" style={{ colorScheme: "light" }}>
      <body
        className="flex min-h-screen items-center justify-center bg-slate-50 p-6 antialiased"
        style={{ backgroundColor: "#f8fafc", color: "#0f172a", margin: 0 }}
      >
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-[#0B1F3A]">Error al iniciar</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error.message || "No se pudo cargar la aplicación. Verifique la base de datos y vuelva a intentar."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-lg bg-[#00A9B5] px-4 py-2 text-sm font-semibold text-white"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
