/**
 * Resuelve DATABASE_URL para Prisma.
 * En Render, usar la Internal Database URL tal como la provee el dashboard (hostname *-a).
 * Para conexión externa opcional, definir DATABASE_EXTERNAL_URL / DATABASE_URL_EXTERNAL.
 */
export function getDatabaseUrl(): string {
  const explicitExternal =
    process.env.DATABASE_EXTERNAL_URL?.trim() ||
    process.env.DATABASE_URL_EXTERNAL?.trim();

  const primary = process.env.DATABASE_URL?.trim();
  if (!primary && !explicitExternal) {
    throw new Error(
      "DATABASE_URL is required. On Render, link PostgreSQL to the web service."
    );
  }

  if (explicitExternal) {
    return withSsl(explicitExternal);
  }

  return primary!;
}

export function databaseHostLabel(url: string): string {
  try {
    return new URL(url.replace(/^postgres(ql)?:\/\//, "https://")).hostname;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

function withSsl(url: string): string {
  if (url.includes("sslmode=")) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}sslmode=require`;
}
