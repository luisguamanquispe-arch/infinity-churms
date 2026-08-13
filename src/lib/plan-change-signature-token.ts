import { createHash, randomBytes } from "crypto";

export function generateSignatureToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = hashSignatureToken(token);
  return { token, hash };
}

export function hashSignatureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateIdentityFileId(): string {
  return `verification_${randomBytes(6).toString("hex")}`;
}
