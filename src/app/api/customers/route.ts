import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatCustomerPayload, validateCustomerInput, extractPlanFields } from "@/lib/customer-form";
import {
  assertNoDuplicateSerialsInPayload,
  assertUniqueEquipmentSerial,
  isEquipmentSerialConflict,
} from "@/lib/equipment-serial";
import { searchCustomers } from "@/lib/services/customer-search";
import { prisma } from "@/lib/prisma";
import { businessDateToday, parseBusinessDateInput } from "@/lib/business-date";
import type { EquipmentType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const all = sp.get("all") === "1";
    const morosoOnly = sp.get("morosoOnly") === "1";
    const zone = sp.get("zone")?.trim() || undefined;

    const customers = await searchCustomers({
      q: q || undefined,
      morosoOnly,
      zone,
      limit: all ? 100 : q ? 25 : 100,
    });

    return NextResponse.json(customers);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAnyPermission("customers:edit", "customers:manage");
    const body = await request.json();

    if (body.hasTvStreaming && !body.tvStreamingSince) {
      return NextResponse.json(
        { error: "Indique la fecha de inicio del soporte de Streams" },
        { status: 400 }
      );
    }

    const formatted = formatCustomerPayload(body);
    const validationError = validateCustomerInput(formatted);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const pendingBalance = body.pendingBalance ?? 0;
    const overdueSince =
      body.overdueSince && pendingBalance > 0
        ? parseBusinessDateInput(body.overdueSince)
        : pendingBalance > 0
          ? businessDateToday()
          : null;

    const originTechnology = body.originTechnology === "RADIOENLACE" ? "RADIOENLACE" : "FIBRA";
    const currentTechnology =
      body.currentTechnology === "RADIOENLACE" ? "RADIOENLACE" : originTechnology;
    const serviceStart = parseBusinessDateInput(body.serviceStartDate);
    const fiberInstallDate =
      body.fiberInstallDate
        ? parseBusinessDateInput(body.fiberInstallDate)
        : originTechnology === "FIBRA"
          ? serviceStart
          : null;

    const equipmentRows = (body.equipment ?? []).map(
      (eq: { type: EquipmentType; serial?: string; brand?: string; model?: string }, i: number) => ({
        type: eq.type,
        serial: formatted.equipment[i]?.serial ?? null,
        brand: formatted.equipment[i]?.brand ?? null,
        model: formatted.equipment[i]?.model ?? null,
      })
    );

    assertNoDuplicateSerialsInPayload(
      equipmentRows.map((eq: { serial: string | null }) => eq.serial)
    );
    for (const eq of equipmentRows) {
      await assertUniqueEquipmentSerial(eq.serial);
    }

    const customer = await prisma.customer.create({
      data: {
        contract: formatted.contract,
        name: formatted.name,
        cedula: formatted.cedula,
        address: formatted.address,
        zone: formatted.zone,
        phone: formatted.phone,
        serviceStartDate: serviceStart,
        planName: formatted.planName,
        ...extractPlanFields(body),
        originTechnology,
        currentTechnology,
        fiberInstallDate,
        fiberMigrationDate: body.fiberMigrationDate
          ? parseBusinessDateInput(body.fiberMigrationDate)
          : null,
        migrationReviewRequired:
          originTechnology === "RADIOENLACE" &&
          currentTechnology === "FIBRA" &&
          !body.fiberMigrationDate,
        hasTvStreaming: Boolean(body.hasTvStreaming),
        tvStreamingSince:
          body.hasTvStreaming && body.tvStreamingSince
            ? parseBusinessDateInput(body.tvStreamingSince)
            : null,
        pendingBalance,
        overdueSince,
        equipment: {
          create: equipmentRows,
        },
      },
      include: { equipment: true },
    });

    await audit({
      userId: session.userId,
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      detail: customer.contract,
    });

    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (isEquipmentSerialConflict(e)) {
      return NextResponse.json(
        { error: "Ya existe un equipo registrado con esa serie" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
