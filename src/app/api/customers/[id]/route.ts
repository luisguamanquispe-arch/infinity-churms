import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { customerHasCancellation } from "@/lib/services/cancellations";
import { getBajaEligibility } from "@/lib/services/collections";
import { resolveOverdueSinceOnBalanceChange } from "@/lib/services/overdue";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!customer) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const hasCancellation = await customerHasCancellation(id);
    const eligibility = await getBajaEligibility(id);

    return NextResponse.json({ ...customer, hasCancellation, eligibility });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.pendingBalance !== undefined) {
      data.pendingBalance = body.pendingBalance;
      const newBalance = Number(body.pendingBalance);
      data.overdueSince = resolveOverdueSinceOnBalanceChange(
        Number(existing.pendingBalance),
        newBalance,
        existing.overdueSince
      );
      if (newBalance > 0) {
        data.inCollectionWhitelist = false;
      } else if (newBalance <= 0) {
        data.inCollectionWhitelist = true;
        data.overdueSince = null;
      }
    }
    if (body.overdueSince !== undefined) {
      data.overdueSince = body.overdueSince ? new Date(body.overdueSince) : null;
    }
    if (body.planName !== undefined) data.planName = body.planName;
    if (body.status !== undefined) data.status = body.status;
    if (body.openTechnicalClaim !== undefined) data.openTechnicalClaim = Boolean(body.openTechnicalClaim);
    if (body.hasTvStreaming !== undefined) {
      data.hasTvStreaming = body.hasTvStreaming;
      if (!body.hasTvStreaming) data.tvStreamingSince = null;
    }
    if (body.tvStreamingSince !== undefined && body.hasTvStreaming) {
      data.tvStreamingSince = new Date(body.tvStreamingSince);
    }
    if (body.originTechnology !== undefined) {
      data.originTechnology = body.originTechnology === "RADIOENLACE" ? "RADIOENLACE" : "FIBRA";
    }
    if (body.currentTechnology !== undefined) {
      data.currentTechnology =
        body.currentTechnology === "RADIOENLACE" ? "RADIOENLACE" : "FIBRA";
    }
    if (body.fiberInstallDate !== undefined) {
      data.fiberInstallDate = body.fiberInstallDate ? new Date(body.fiberInstallDate) : null;
    }
    if (body.fiberMigrationDate !== undefined) {
      data.fiberMigrationDate = body.fiberMigrationDate
        ? new Date(body.fiberMigrationDate)
        : null;
    }
    if (body.migrationReviewRequired !== undefined) {
      data.migrationReviewRequired = Boolean(body.migrationReviewRequired);
    }

    const customer = await prisma.customer.update({
      where: { id },
      data,
      include: { equipment: true },
    });

    await audit({
      userId: session.userId,
      action: "UPDATE",
      entity: "Customer",
      entityId: id,
      detail: body.openTechnicalClaim !== undefined
        ? `Reclamo técnico: ${body.openTechnicalClaim ? "abierto" : "cerrado"}`
        : body.pendingBalance !== undefined
          ? `Saldo: ${body.pendingBalance}`
          : undefined,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
