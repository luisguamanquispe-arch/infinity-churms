import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
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
    await requireSession();
    const { id } = await params;
    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:delete");
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
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
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
      const session = await requireSession();
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
      const session = await requirePermission("cancellations:edit");
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
      const session = await requirePermission("cancellations:edit");
      const updateData: Parameters<typeof updateCancellationAdmin>[1] = {};

      if (body.reason !== undefined) updateData.reason = body.reason as CancellationReason;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.requestDate !== undefined) {
        const parsed = new Date(body.requestDate);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Fecha de solicitud inválida" }, { status: 400 });
        }
        updateData.requestDate = parsed;
      }
      if (body.closeDate !== undefined) {
        updateData.closeDate = body.closeDate ? new Date(body.closeDate) : null;
      }
      if (body.status !== undefined) updateData.status = body.status as CancellationStatus;
      if (body.invoiceNumber !== undefined) updateData.invoiceNumber = body.invoiceNumber;
      if (body.clientSignature !== undefined) updateData.clientSignature = body.clientSignature;
      if (body.actaNumber !== undefined) updateData.actaNumber = body.actaNumber;
      if (body.actaPhysicalCode !== undefined) updateData.actaPhysicalCode = body.actaPhysicalCode;
      if (body.monthsCompleted !== undefined) updateData.monthsCompleted = Number(body.monthsCompleted);
      if (body.permanenceStartDate !== undefined) {
        updateData.permanenceStartDate = body.permanenceStartDate
          ? new Date(body.permanenceStartDate)
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

      if (next === "PENDIENTE_DE_PAGO") {
        try {
          await assertPreliquidacionApproved(id);
        } catch (e) {
          if (e instanceof Error && e.message === "PRELIQUIDACION_NOT_APPROVED") {
            return NextResponse.json(
              { error: "La preliquidación debe estar aprobada por el cliente." },
              { status: 403 }
            );
          }
          throw e;
        }
      }

      const perm =
        next === "EQUIPOS_RECUPERADOS"
          ? "cancellations:advance_equipment"
          : next === "PENDIENTE_DE_PAGO"
            ? "cancellations:preliquidate"
            : "cancellations:close";
      const session = await requirePermission(perm);

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

      const updated = await prisma.cancellation.update({
        where: { id },
        data: {
          status: next,
          ...(next === "BAJA_COMPLETADA" ? { closeDate: new Date() } : {}),
        },
      });

      await audit({ userId: session.userId, action: "STATUS", entity: "Cancellation", entityId: id, detail: next, ipAddress: getClientIp(request) });
      return NextResponse.json(updated);
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
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
