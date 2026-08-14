import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME, APP_SHORT_NAME, COMPANY_NAME, ICON_PATH } from "@/lib/constants";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${COMPANY_NAME}`,
  },
  description: `${APP_SHORT_NAME} — ${COMPANY_NAME}`,
  icons: {
    icon: ICON_PATH,
    apple: ICON_PATH,
  },
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
