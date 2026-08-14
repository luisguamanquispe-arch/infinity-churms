import Image from "next/image";
import { APP_SHORT_NAME, COLORS, COMPANY_NAME, LOGO_PATH } from "@/lib/constants";

type LogoVariant = "full" | "sidebar" | "compact" | "header";

const SIZES: Record<LogoVariant, { width: number; height: number }> = {
  full: { width: 180, height: 140 },
  sidebar: { width: 140, height: 108 },
  compact: { width: 120, height: 92 },
  header: { width: 96, height: 74 },
};

interface InfinityLogoProps {
  variant?: LogoVariant;
  /** Fondo claro detrás del logo (sidebar navy, headers oscuros) */
  onDark?: boolean;
  className?: string;
  priority?: boolean;
}

export function InfinityLogo({
  variant = "full",
  onDark = false,
  className = "",
  priority = false,
}: InfinityLogoProps) {
  const { width, height } = SIZES[variant];

  const img = (
    <Image
      src={LOGO_PATH}
      alt={`${COMPANY_NAME} — ${APP_SHORT_NAME}`}
      width={width}
      height={height}
      priority={priority}
      className="h-auto w-full object-contain"
    />
  );

  if (onDark) {
    return (
      <div
        className={`rounded-lg bg-white p-2 shadow-sm ${className}`}
        style={{ maxWidth: width + 16 }}
      >
        {img}
      </div>
    );
  }

  return <div className={className} style={{ maxWidth: width }}>{img}</div>;
}

export function InfinityWordmark({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm font-bold leading-tight tracking-wide text-[#0B1F3A]">
        {COMPANY_NAME.split(" ")[0]}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
        {COMPANY_NAME.split(" ")[1] ?? "Internet"}
      </p>
      <p className="mt-0.5 text-[10px]" style={{ color: COLORS.brand }}>
        {APP_SHORT_NAME}
      </p>
    </div>
  );
}
