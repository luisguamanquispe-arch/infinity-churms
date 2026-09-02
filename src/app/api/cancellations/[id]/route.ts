import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAnyPermission, requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  deleteCancellation,
  deleteCancellationCharge,
  getCancellation,
  recalculateCancellation,
  updateCancellationAdmin,
} from "@/lib/services/cancellations";
import { computeFinalLiquidation } from "@/lib/services/preliquidaciones";
import { assertPreliquidacionApproved } from "@/lib/preliquidacion-guards";
import { assertActaSigned, recordPresencialActaSignature } from "@/lib/services/cancellation-acta-remote-signature";
import type { CancellationReason, CancellationStatus } from "@prisma/client";
import { getClientIp } from "@/lib/request-ip";
import { serializeCancellationByRole } from "@/lib/serialize-cancellation-by-role";
import { syncCustomerStatusAfterCancellationCompleted } from "@/lib/customer-status-sync";
import { parseBusinessDateInput, BusinessDateError } from "@/lib/business-date";

const FLOW: Partial<Record<CancellationStatus, CancellationStatus>> = {
  BAJA_AUTORIZADA: "PENDIENTE_DE_PAGO",
  PAGADA: "EQUIPOS_RECUPERADOS",
  LIQUIDACION_FINAL: "BAJA_COMPLETADA",
  EQUIPOS_RECUPERADOS: "BAJA_COMPLETADA",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(serializeCancellationByRole(row, session.role));
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const removed = await deleteCancellation(id);

    await audit({
      userId: session.userId,
      action: "DELETE",
      entity: "Cancellation",
      entityId: id,
      detail: `Baja eliminada · ${removed.customer.contract} · ${removed.customer.name}`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Solo administradores pueden eliminar bajas" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "save_signature") {
      const session = await requirePermission("cancellations:acta_send");
      const name = body.clientSignature?.trim() || null;
      await prisma.cancellation.update({
        where: { id },
        data: { clientSignature: name },
      });
      const current = await prisma.cancellation.findUnique({ where: { id }, select: { status: true } });
      if (current?.status === "LIQUIDACION_FINAL" && name) {
        await recordPresencialActaSignature(id, name);
      }
      await audit({
        userId: session.userId,
        action: "SIGNATURE",
        entity: "Cancellation",
        entityId: id,
        ipAddress: getClientIp(request),
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "add_charge") {
      const session = await requirePermission("cancellations:charges");
      await prisma.cancellationCharge.create({
        data: { cancellationId: id, concept: body.concept, amount: body.amount },
      });
      await recalculateCancellation(id);
      await audit({ userId: session.userId, action: "ADD_CHARGE", entity: "Cancellation", entityId: id });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_charge") {
      const session = await requireAdmin();
      if (!body.chargeId) {
        return NextResponse.json({ error: "Cargo no indicado" }, { status: 400 });
      }
      await deleteCancellationCharge(id, body.chargeId);
      await audit({
        userId: session.userId,
        action: "DELETE_CHARGE",
        entity: "Cancellation",
        entityId: id,
        detail: body.chargeId,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      const session = await requireAdmin();
      const updateData: Parameters<typeof updateCancellationAdmin>[1] = {};

      if (body.reason !== undefined) updateData.reason = body.reason as CancellationReason;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.requestDate !== undefined) {
        try {
          updateData.requestDate = parseBusinessDateInput(body.requestDate);
        } catch {
          return NextResponse.json({ error: "Fecha de solicitud inválida" }, { status: 400 });
        }
      }
      if (body.closeDate !== undefined) {
        updateData.closeDate = body.closeDate
          ? parseBusinessDateInput(body.closeDate)
          : null;
      }
      if (body.status !== undefined) updateData.status = body.status as CancellationStatus;
      if (body.invoiceNumber !== undefined) updateData.invoiceNumber = body.invoiceNumber;
      if (body.clientSignature !== undefined) updateData.clientSignature = body.clientSignature;
      if (body.actaNumber !== undefined) updateData.actaNumber = body.actaNumber;
      if (body.actaPhysicalCode !== undefined) updateData.actaPhysicalCode = body.actaPhysicalCode;
      if (body.monthsCompleted !== undefined) updateData.monthsCompleted = Number(body.monthsCompleted);
      if (body.permanenceStartDate !== undefined) {
        updateData.permanenceStartDate = body.permanenceStartDate
          ? parseBusinessDateInput(body.permanenceStartDate)
          : null;
      }
      if (body.originTechnology !== undefined) updateData.originTechnology = body.originTechnology;
      if (body.currentTechnology !== undefined) updateData.currentTechnology = body.currentTechnology;
      if (body.fiberInstallPending !== undefined) {
        updateData.fiberInstallPending = Boolean(body.fiberInstallPending);
      }
      if (body.permanenceAmount !== undefined) updateData.permanenceAmount = Number(body.permanenceAmount);
      if (body.tvAmount !== undefined) updateData.tvAmount = Number(body.tvAmount);
      if (body.monthlyAmount !== undefined) updateData.monthlyAmount = Number(body.monthlyAmount);
      if (body.equipmentAmount !== undefined) updateData.equipmentAmount = Number(body.equipmentAmount);
      if (body.otherAmount !== undefined) updateData.otherAmount = Number(body.otherAmount);
      if (body.totalAmount !== undefined) updateData.totalAmount = Number(body.totalAmount);
      if (body.recalculate === true) updateData.recalculate = true;
      if (Array.isArray(body.charges)) updateData.charges = body.charges;
      if (Array.isArray(body.deletedChargeIds)) updateData.deletedChargeIds = body.deletedChargeIds;
      if (Array.isArray(body.payments)) {
        updateData.payments = body.payments.map(
          (p: {
            id?: string;
            paymentDate: string;
            method: string;
            invoiceNumber: string;
            amountPaid: number;
            notes?: string | null;
          }) => ({
            ...p,
            paymentDate: new Date(p.paymentDate),
          })
        );
      }
      if (Array.isArray(body.deletedPaymentIds)) updateData.deletedPaymentIds = body.deletedPaymentIds;
      if (Array.isArray(body.equipment)) updateData.equipment = body.equipment;

      const updated = await updateCancellationAdmin(id, updateData);
      await audit({
        userId: session.userId,
        action: "UPDATE",
        entity: "Cancellation",
        entityId: id,
        detail: body.recalculate ? "Recálculo automático" : "Edición administrativa completa",
        ipAddress: getClientIp(request),
      });
      return NextResponse.json(updated);
    }

    if (body.action === "advance_status") {
      const current = await prisma.cancellation.findUnique({ where: { id } });
      if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

      const next = FLOW[current.status];
      if (!next) {
        return NextResponse.json({ error: "Transición no permitida" }, { status: 400 });
      }

      if (next === "PENDIENTE_DE_PAGO" || next === "BAJA_COMPLETADA") {
        try {
          await assertPreliquidacionApproved(id);
        } catch (e) {
          if (e instanceof Error && e.message === "PRELIQUIDACION_NOT_APPROVED") {
            return NextResponse.json(
              {
                error:
                  "No se puede completar la baja. La preliquidación todavía no ha sido aprobada por el cliente.",
              },
              { status: 403 }
            );
          }
          if (e instanceof Error && e.message === "PRELIQUIDACION_REQUIRED") {
            return NextResponse.json(
              {
                error:
                  "No se puede continuar. Debe generar la preliquidación y obtener la aprobación del cliente.",
              },
              { status: 403 }
            );
          }
          throw e;
        }
      }

      const session =
        next === "EQUIPOS_RECUPERADOS"
          ? await requireAnyPermission("cancellations:advance_equipment", "cancellations:liquidate")
          : next === "PENDIENTE_DE_PAGO"
            ? await requirePermission("cancellations:preliquidate")
            : await requireAnyPermission("cancellations:close", "cancellations:liquidate");

      if (next === "EQUIPOS_RECUPERADOS") {
        const pending = await prisma.cancellationEquipment.count({
          where: { cancellationId: id, delivered: false },
        });
        if (pending > 0) {
          return NextResponse.json({ error: "Registre todos los equipos primero" }, { status: 400 });
        }
        await computeFinalLiquidation(id);
        const afterLiq = await prisma.cancellation.findUnique({ where: { id } });
        if (afterLiq?.status === "LIQUIDACION_FINAL") {
          await audit({
            userId: session.userId,
            action: "FINAL_LIQUIDATION",
            entity: "Cancellation",
            entityId: id,
            ipAddress: getClientIp(request),
          });
          return NextResponse.json(afterLiq);
        }
      }

      if (next === "BAJA_COMPLETADA") {
        if (current.status === "LIQUIDACION_FINAL") {
          try {
            await assertActaSigned(id);
          } catch (e) {
            if (e instanceof Error && e.message === "ACTA_NOT_SIGNED") {
              return NextResponse.json(
                { error: "El acta debe estar firmada por el cliente antes de completar la baja." },
                { status: 403 }
              );
            }
            throw e;
          }
        }
        const invoice = current.invoiceNumber ?? (await prisma.cancellationPayment.findFirst({ where: { cancellationId: id } }))?.invoiceNumber;
        if (!invoice) {
          return NextResponse.json({ error: "Factura obligatoria para cerrar la baja" }, { status: 400 });
        }
      }

      const updated = await prisma.cancellation.updateMany({
        where: { id, status: current.status },
        data: {
          status: next,
          ...(next === "BAJA_COMPLETADA" ? { closeDate: new Date() } : {}),
        },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { error: "El estado de la baja cambió. Recargue e intente de nuevo." },
          { status: 409 }
        );
      }

      if (next === "BAJA_COMPLETADA") {
        await syncCustomerStatusAfterCancellationCompleted(current.customerId);
      }

      const afterUpdate = await prisma.cancellation.findUnique({ where: { id } });

      await audit({ userId: session.userId, action: "STATUS", entity: "Cancellation", entityId: id, detail: next, ipAddress: getClientIp(request) });
      return NextResponse.json(afterUpdate);
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (e instanceof Error && e.message === "PERMANENCE_INCOMPLETE") {
      return NextResponse.json(
        { error: "No se puede recalcular: falta información de permanencia de fibra del cliente" },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "FINANCIAL_OVERRIDE_REQUIRES_RECALCULATE") {
      return NextResponse.json(
        {
          error:
            "Los montos financieros solo pueden actualizarse mediante recálculo automático en el servidor.",
        },
        { status: 400 }
      );
    }
    if (e instanceof BusinessDateError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
