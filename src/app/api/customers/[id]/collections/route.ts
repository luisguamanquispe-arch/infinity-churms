import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { prisma } from "@/lib/prisma";
import {
  createCollectionAction,
  getBajaEligibility,
  getCustomerAgentHistory,
  listCollectionActions,
} from "@/lib/services/collections";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;
    const [actions, eligibility, agentHistory, customer] = await Promise.all([
      listCollectionActions(id),
      getBajaEligibility(id),
      getCustomerAgentHistory(id),
      prisma.customer.findUnique({
        where: { id },
        select: { assignedAgentUserId: true, assignedAgentName: true },
      }),
    ]);
    return NextResponse.json({
      actions,
      eligibility,
      agentHistory,
      assignedAgent: customer
        ? {
            userId: customer.assignedAgentUserId,
            name: customer.assignedAgentName,
          }
        : null,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id } = await params;
    const body = await request.json();

    const item = await createCollectionAction(id, session.userId, body);

    await audit({
      userId: session.userId,
      action: "COLLECTION",
      entity: "CollectionAction",
      entityId: item.id,
      detail: `${item.agentName} · ${item.managementType} → ${item.result}`,
      ipAddress: getClientIp(request),
    });

    const eligibility = await getBajaEligibility(id);
    const actions = await listCollectionActions(id);
    const agentHistory = await getCustomerAgentHistory(id);
    return NextResponse.json({ item, eligibility, actions, agentHistory });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "PROMISE_REQUIRED") {
      return NextResponse.json(
        { error: "Promesa de pago requiere fecha compromiso y valor" },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "AGENT_INVALID") {
      return NextResponse.json(
        { error: "Seleccione un agente de cobranza válido y activo" },
        { status: 400 }
      );
    }
    if (e instanceof Error && (e.message === "ATTACHMENT_TOO_LARGE" || e.message === "PHOTO_TOO_LARGE")) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx. 500 KB)" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
