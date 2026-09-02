import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  listCollectionPayments,
  registerCollectionPayment,
  CollectionPaymentError,
} from "@/lib/services/collection-payments";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;
    const payments = await listCollectionPayments(id);
    return NextResponse.json(payments);
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

    const result = await registerCollectionPayment(id, session.userId, {
      paymentDate: body.paymentDate ?? new Date().toISOString().slice(0, 10),
      amount: Number(body.amount),
      fenixDocument: String(body.fenixDocument ?? ""),
      paymentMethod: body.paymentMethod,
      notes: body.notes,
    });

    await audit({
      userId: session.userId,
      action: "COLLECTION_PAYMENT",
      entity: "CollectionPayment",
      entityId: result.payment.id,
      detail: `Fenix ${result.payment.fenixDocument} · ${result.payment.amount}`,
      ipAddress: getClientIp(request),
    });

    if (result.paidInFull) {
      await audit({
        userId: session.userId,
        action: "WHITELIST",
        entity: "Customer",
        entityId: id,
        detail: "Lista blanca — cuenta al día",
        ipAddress: getClientIp(request),
      });
    }

    const payments = await listCollectionPayments(id);

    return NextResponse.json({
      payment: result.payment,
      paidInFull: result.paidInFull,
      remainingBalance: result.remainingBalance,
      inCollectionWhitelist: result.customer.inCollectionWhitelist,
      pendingBalance: String(result.customer.pendingBalance),
      payments,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof CollectionPaymentError) {
      if (e.message === "FENIX_REQUIRED") {
        return NextResponse.json({ error: "Indique N° recibo o factura Fenix" }, { status: 400 });
      }
      if (e.message === "AMOUNT_REQUIRED" || e.message === "AMOUNT_INVALID") {
        return NextResponse.json({ error: "Indique un valor de pago válido" }, { status: 400 });
      }
      if (e.message === "ALREADY_PAID") {
        return NextResponse.json({ error: "El cliente ya está al día (lista blanca)" }, { status: 400 });
      }
      if (e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }
      if (e.message === "CONCURRENT_BALANCE_UPDATE") {
        return NextResponse.json(
          { error: "El saldo cambió mientras registraba el pago. Recargue e intente de nuevo." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 });
  }
}
