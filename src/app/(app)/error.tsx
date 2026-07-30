"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      style={{ backgroundColor: "#f8fafc" }}
    >
      <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-[#0B1F3A]">No se pudo cargar la aplicación</h1>
        <p className="mt-2 text-sm text-slate-600">
          {error.message || "Ocurrió un error al iniciar. Verifique la conexión a la base de datos."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-[#00A9B5] px-4 py-2 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
