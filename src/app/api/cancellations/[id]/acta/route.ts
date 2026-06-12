import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { nextActaNumber } from "@/lib/acta-number";
import { getCancellation } from "@/lib/services/cancellations";
import { generateActaPdf } from "@/lib/pdf-acta";
import { getAppBaseUrl } from "@/lib/app-url";
import { REASON_LABELS } from "@/lib/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const baseUrl = getAppBaseUrl(request);
    const qrCode = row.qrCode ?? `BAJA-${id.slice(-8).toUpperCase()}`;
    const actaNumber = row.actaNumber ?? (await nextActaNumber());
    const verifyUrl = `${baseUrl}/bajas/${id}`;

    if (!row.qrCode || !row.actaNumber) {
      await prisma.cancellation.update({
        where: { id },
        data: { qrCode, actaNumber },
      });
    }

    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 200 });
    const payment = row.payments[0] ?? null;

    const pdf = await generateActaPdf({
      cancellation: { ...row, actaNumber },
      customer: row.customer,
      equipment: row.equipment,
      charges: row.charges,
      payment,
      verifyUrl,
      qrDataUrl,
      reasonLabel: REASON_LABELS[row.reason] ?? row.reason,
    });

    await audit({ action: "PDF_ACTA", entity: "Cancellation", entityId: id });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="acta-${row.customer.contract}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error PDF" }, { status: 500 });
  }
}
