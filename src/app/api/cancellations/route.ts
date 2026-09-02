import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  createCancellationRecord,
  CancellationConflictError,
  customerHasCancellation,
  initEquipmentChecklist,
  listCancellations,
  recalculateCancellation,
  validatePermanenceForCancellation,
  customerTechnologyInput,
  getPermanencePreviewForCustomer,
} from "@/lib/services/cancellations";
import { createInitialPreliquidacion } from "@/lib/services/preliquidaciones";
import { PERMANENCE_AUDIT_REASON } from "@/lib/permanence";
import { validateClientPath, type BajaClientPath } from "@/lib/baja-client-path";
import { getBajaEligibility } from "@/lib/services/collections";
import { getClientIp } from "@/lib/request-ip";
import {
  sanitizePdfFileName,
  validateWithdrawalRequestPdf,
} from "@/lib/cancellation-withdrawal-document";
import { parseBusinessDateInput, BusinessDateError } from "@/lib/business-date";
import { serializeCancellationListItemByRole } from "@/lib/serialize-cancellation-by-role";
import type { CancellationReason } from "@prisma/client";

const VALID_REASONS: CancellationReason[] = [
  "FALLAS_CONTINUAS",
  "INCUMPLIMIENTO_CONTRATO",
  "MUDANZA",
  "PROBLEMAS_ATENCION",
  "MEJOR_OFERTA",
  "DECISION_VOLUNTARIA",
];

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const sp = request.nextUrl.searchParams;
    const rows = await listCancellations({
      status: sp.get("status") ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      q: sp.get("q") ?? undefined,
    });
    return NextResponse.json(rows.map((r) => serializeCancellationListItemByRole(r, session.role)));
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("cancellations:create");
    const {
      customerId,
      notes,
      reason,
      requestDate: requestDateBody,
      clientPath,
      withdrawalRequestFileName,
      withdrawalRequestFileData,
    } = await request.json();

    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Motivo de baja obligatorio" }, { status: 400 });
    }

    const requestDate = requestDateBody
      ? parseBusinessDateInput(String(requestDateBody))
      : new Date();

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    if (customer.hasTvStreaming && !customer.tvStreamingSince) {
      return NextResponse.json(
        { error: "Cliente con soporte de Streams debe tener fecha de inicio del servicio" },
        { status: 400 }
      );
    }

    if (await customerHasCancellation(customerId)) {
      return NextResponse.json(
        { error: "Este cliente ya tiene una baja registrada. No se puede crear otra." },
        { status: 409 }
      );
    }

    const eligibility = await getBajaEligibility(customerId);
    if (!eligibility.allowed) {
      return NextResponse.json(
        { error: eligibility.blockers.join(". ") },
        { status: 400 }
      );
    }

    if (clientPath) {
      const pathValidation = validateClientPath(clientPath as BajaClientPath, customer);
      if (!pathValidation.ok) {
        return NextResponse.json({ error: pathValidation.message }, { status: 400 });
      }
    }

    const techInput = customerTechnologyInput(customer);
    const permanenceValidation = validatePermanenceForCancellation(techInput);
    if (!permanenceValidation.ok) {
      return NextResponse.json({ error: permanenceValidation.warning }, { status: 400 });
    }

    const permanencePreview = await getPermanencePreviewForCustomer(customerId, requestDate);
    if (!permanencePreview.canCalculate) {
      return NextResponse.json({ error: permanencePreview.warning }, { status: 400 });
    }

    const withdrawalPdfError = validateWithdrawalRequestPdf(
      withdrawalRequestFileName,
      withdrawalRequestFileData
    );
    if (withdrawalPdfError) {
      return NextResponse.json({ error: withdrawalPdfError }, { status: 400 });
    }

    const archivedPdfName = sanitizePdfFileName(withdrawalRequestFileName);
    const archivedPdfData = withdrawalRequestFileData.trim();

    let cancellation;
    try {
      cancellation = await createCancellationRecord({
        customerId,
        reason,
        notes,
        requestDate,
        createdById: session.userId,
        withdrawalRequestFileName: archivedPdfName,
        withdrawalRequestFileData: archivedPdfData,
      });
    } catch (createError) {
      if (createError instanceof CancellationConflictError) {
        return NextResponse.json(
          { error: "Este cliente ya tiene una baja registrada. No se puede crear otra." },
          { status: 409 }
        );
      }
      throw createError;
    }

    try {
      await initEquipmentChecklist(cancellation.id, customerId);
      await recalculateCancellation(cancellation.id);
      await createInitialPreliquidacion(cancellation.id, session.userId);
    } catch (setupError) {
      await prisma.cancellation.delete({ where: { id: cancellation.id } }).catch(() => undefined);
      throw setupError;
    }

    await audit({
      userId: session.userId,
      action: "CREATE",
      entity: "Cancellation",
      entityId: cancellation.id,
      detail: `Baja ${customer.contract} · PDF solicitud de retiro archivado`,
      ipAddress: getClientIp(request),
    });

    if (permanencePreview.fiberInstallPending) {
      await audit({
        userId: session.userId,
        action: "PERMANENCE_CHARGE",
        entity: "Cancellation",
        entityId: cancellation.id,
        detail: `${PERMANENCE_AUDIT_REASON} · ${permanencePreview.installAmount} USD · meses=${permanencePreview.monthsInFiber}/${permanencePreview.minContractMonths}`,
        ipAddress: getClientIp(request),
      });
    }

    return NextResponse.json({ id: cancellation.id });
  } catch (e) {
    if (e instanceof BusinessDateError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "PERMANENCE_INCOMPLETE") {
      return NextResponse.json(
        { error: "No se pudo calcular la preliquidación: falta información de permanencia del cliente." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Cliente o baja no encontrada" }, { status: 404 });
    }
    console.error("POST /api/cancellations", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al crear la baja" },
      { status: 500 }
    );
  }
}
