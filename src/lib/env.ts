function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Returns a required environment variable. Never falls back to hardcoded secrets.
 * In production the process must fail if the variable is missing.
 * In development the process also fails with a clear message to configure .env.
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  const scope = isProduction() ? "production" : "development";
  throw new Error(
    `${name} is required in ${scope}. Configure it in the environment (see .env.example).`
  );
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getRequiredEnv("JWT_SECRET"));
}
