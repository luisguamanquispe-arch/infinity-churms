type PreliquidacionRow = {
  id: string;
  version: number;
  status: string;
  docNumber: string | null;
  totalAmount: unknown;
  creditsAmount: unknown;
  subtotal: unknown;
  rejectionReason?: string | null;
  rejectedAt?: Date | null;
  approvedAt?: Date | null;
  lineItems: { id: string; category: string; concept: string; amount: unknown }[];
  approvalTokens?: {
    status: string;
    expiresAt: Date;
    sentAt: Date | null;
    openedAt: Date | null;
  }[];
};

export function serializePreliquidacion(row: PreliquidacionRow | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    docNumber: row.docNumber,
    totalAmount: String(row.totalAmount),
    creditsAmount: String(row.creditsAmount),
    subtotal: String(row.subtotal),
    rejectionReason: row.rejectionReason ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    lineItems: row.lineItems.map((l) => ({
      id: l.id,
      category: l.category,
      concept: l.concept,
      amount: String(l.amount),
    })),
    approvalTokens: (row.approvalTokens ?? []).map((t) => ({
      status: t.status,
      expiresAt: t.expiresAt.toISOString(),
      sentAt: t.sentAt?.toISOString() ?? null,
      openedAt: t.openedAt?.toISOString() ?? null,
    })),
  };
}
