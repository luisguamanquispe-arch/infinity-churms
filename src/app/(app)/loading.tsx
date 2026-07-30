export default function AppLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      style={{ backgroundColor: "#f8fafc" }}
    >
      <div className="text-center">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#00A9B5]"
          aria-hidden
        />
        <p className="mt-4 text-sm font-medium text-[#0B1F3A]">Cargando Infinity Bajas…</p>
      </div>
    </div>
  );
}
