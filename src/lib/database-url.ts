/**
 * Resuelve DATABASE_URL para Prisma.
 * En Render, la URL interna (*-a) a veces no responde al arrancar; usamos la externa (.postgres.render.com).
 */
export function getDatabaseUrl(): string {
  const explicitExternal =
    process.env.DATABASE_EXTERNAL_URL?.trim() ||
    process.env.DATABASE_URL_EXTERNAL?.trim();

  const primary = process.env.DATABASE_URL?.trim();
  if (!primary && !explicitExternal) {
    throw new Error(
      "DATABASE_URL is required. On Render, link PostgreSQL to the web service or set DATABASE_URL to the External Database URL."
    );
  }

  if (explicitExternal) {
    return withSsl(explicitExternal);
  }

  return withSsl(resolveRenderPostgresUrl(primary!));
}

export function databaseHostLabel(url: string): string {
  try {
    return new URL(url.replace(/^postgres(ql)?:\/\//, "https://")).hostname;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

function resolveRenderPostgresUrl(url: string): string {
  if (!isRenderRuntime()) {
    return url;
  }

  if (url.includes(".postgres.render.com")) {
    return url;
  }

  const region = process.env.RENDER_REGION?.trim() || "oregon";
  const external = url.replace(
    /@dpg-([a-z0-9]+)-a\//i,
    `@dpg-$1.${region}-postgres.render.com/`
  );

  return external !== url ? external : url;
}

function isRenderRuntime(): boolean {
  return (
    process.env.RENDER === "true" ||
    Boolean(process.env.RENDER_SERVICE_ID) ||
    Boolean(process.env.RENDER_EXTERNAL_URL)
  );
}

function withSsl(url: string): string {
  if (url.includes("sslmode=")) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}sslmode=require`;
}
