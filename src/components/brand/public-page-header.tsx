import { InfinityLogo } from "@/components/brand/infinity-logo";
import { COLORS } from "@/lib/constants";

interface PublicPageHeaderProps {
  title: string;
  subtitle?: string;
  /** Cabecera con fondo navy (páginas de firma / cliente) */
  dark?: boolean;
}

export function PublicPageHeader({ title, subtitle, dark = false }: PublicPageHeaderProps) {
  if (dark) {
    return (
      <header className="px-4 py-5 text-white" style={{ backgroundColor: COLORS.navy }}>
        <div className="mx-auto flex max-w-lg items-center gap-4">
          <InfinityLogo variant="header" onDark />
          <div>
            <p className="text-xs uppercase tracking-wide opacity-80">{title}</p>
            {subtitle && <p className="mt-1 text-sm text-teal-100">{subtitle}</p>}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b bg-white px-4 py-5">
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <InfinityLogo variant="compact" priority />
        <h1 className="mt-3 text-lg font-bold text-[#0B1F3A]">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
