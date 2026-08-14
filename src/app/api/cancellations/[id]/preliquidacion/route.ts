import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCancellation } from "@/lib/services/cancellations";
import { hasPermission } from "@/lib/permissions";
import {
  generatePreliquidacion,
  getActivePreliquidacion,
  listPreliquidaciones,
  regeneratePreliquidacion,
  ensureActivePreliquidacion,
} from "@/lib/services/preliquidaciones";
import { generatePreliquidacionPdf } from "@/lib/pdf-preliquidacion";
import { REASON_LABELS } from "@/lib/constants";
import { getClientIp } from "@/lib/request-ip";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const format = _request.nextUrl.searchParams.get("format");

    if (format === "pdf") {
      const row = await getCancellation(id);
      if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      const active = row.activePreliquidacion ?? (await getActivePreliquidacion(id));
      const docNumber = active?.docNumber ?? `PRE-${row.customer.contract}`;

      const pdf = generatePreliquidacionPdf({
        docNumber,
        cancellation: row,
        customer: row.customer,
        equipment: row.equipment,
        charges: row.charges,
        reasonLabel: REASON_LABELS[row.reason] ?? row.reason,
        lineItems: active?.lineItems.map((l) => ({
          concept: l.concept,
          amount: Number(l.amount),
        })),
        version: active?.version,
        totalOverride: active ? Number(active.totalAmount) : undefined,
      });

      await audit({
        userId: session.userId,
        action: "PDF_PRELIQUIDACION",
        entity: "Cancellation",
        entityId: id,
        detail: docNumber,
      });

      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="preliquidacion-${row.customer.contract}.pdf"`,
        },
      });
    }

    const versions = await listPreliquidaciones(id);
    let active = await getActivePreliquidacion(id);

    if (!active && hasPermission(session.role, "cancellations:preliquidate")) {
      try {
        await ensureActivePreliquidacion(id, session.userId);
        active = await getActivePreliquidacion(id);
      } catch {
        // Sin permiso o error: devolver lo que haya en historial.
      }
    }

    return NextResponse.json({ active, versions });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:preliquidate");
    const { id } = await params;
    const body = await request.json();

    if (body.action === "generate") {
      const preliq = await generatePreliquidacion(id, session.userId);
      await audit({
        userId: session.userId,
        action: "PRELIQUIDACION_GENERATED",
        entity: "Cancellation",
        entityId: id,
        detail: `V${preliq.version}`,
        ipAddress: getClientIp(request),
      });
      return NextResponse.json(preliq);
    }

    if (body.action === "regenerate") {
      const preliq = await regeneratePreliquidacion(id, session.userId);
      await audit({
        userId: session.userId,
        action: "PRELIQUIDACION_REGENERATED",
        entity: "Cancellation",
        entityId: id,
        detail: `V${preliq.version}`,
        ipAddress: getClientIp(request),
      });
      return NextResponse.json(preliq);
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "VERSION_LOCKED") {
      return NextResponse.json(
        { error: "No se puede modificar una versión ya enviada. Cree una nueva versión tras el rechazo." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "ALREADY_APPROVED") {
      return NextResponse.json({ error: "La preliquidación ya fue aprobada." }, { status: 400 });
    }
    if (e instanceof Error && e.message === "PERMANENCE_INCOMPLETE") {
      return NextResponse.json({ error: "Falta información de permanencia del cliente." }, { status: 400 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
