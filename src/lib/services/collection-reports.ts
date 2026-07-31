import { prisma } from "@/lib/prisma";
import {
  COLLECTION_CHARGE_TYPE_LABELS,
  COLLECTION_RESULT_LABELS,
  COLLECTION_TYPE_LABELS,
} from "@/lib/constants";
import { formatChargeDetail } from "@/lib/services/collection-charges";
import { getOverdueDays, isPrelegalOverdue, PRELEGAL_OVERDUE_DAYS } from "@/lib/services/overdue";

export type CollectionReportView = "cartera" | "gestiones" | "pagos";

export interface CollectionReportFilters {
  view: CollectionReportView;
  from?: Date;
  to?: Date;
  zone?: string;
  managementType?: string;
  result?: string;
  prelegalOnly?: boolean;
  morosoOnly?: boolean;
}

export interface CollectionReportKpis {
  clientesMorosos: number;
  carteraPendiente: number;
  gestionesPeriodo: number;
  pagosPeriodo: number;
  montoPagosPeriodo: number;
  promesasVigentes: number;
  prelegalCount: number;
  byManagementType: { type: string; label: string; count: number }[];
  byResult: { result: string; label: string; count: number }[];
}

export interface CarteraReportRow {
  customerId: string;
  contract: string;
  name: string;
  zone: string;
  phone: string | null;
  planName: string;
  pendingBalance: number;
  overdueDays: number;
  overdueSince: string | null;
  inCollectionWhitelist: boolean;
  isPrelegal: boolean;
  chargesSummary: string;
  chargesTotal: number;
  lastActionDate: string | null;
  lastActionResult: string | null;
}

export interface GestionReportRow {
  id: string;
  actionDate: string;
  contract: string;
  customerName: string;
  zone: string;
  pendingBalance: number;
  overdueDays: number;
  managementType: string;
  managementTypeLabel: string;
  result: string;
  resultLabel: string;
  userName: string;
  registeredBy: string;
  nextFollowUpDate: string | null;
  promiseDate: string | null;
  promiseAmount: number | null;
  notes: string | null;
}

export interface PagoReportRow {
  id: string;
  paymentDate: string;
  contract: string;
  customerName: string;
  zone: string;
  amount: number;
  fenixDocument: string;
  paymentMethod: string | null;
  userName: string;
  notes: string | null;
}

export interface CollectionReportResult {
  filters: {
    view: CollectionReportView;
    from: string | null;
    to: string | null;
    zone: string | null;
    managementType: string | null;
    result: string | null;
    prelegalOnly: boolean;
    morosoOnly: boolean;
  };
  kpis: CollectionReportKpis;
  rows: CarteraReportRow[] | GestionReportRow[] | PagoReportRow[];
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseCollectionReportFilters(params: URLSearchParams): CollectionReportFilters {
  const viewParam = params.get("view");
  const view: CollectionReportView =
    viewParam === "gestiones" || viewParam === "pagos" ? viewParam : "cartera";

  const fromRaw = params.get("from");
  const toRaw = params.get("to");

  return {
    view,
    from: fromRaw ? startOfDay(new Date(fromRaw)) : undefined,
    to: toRaw ? endOfDay(new Date(toRaw)) : undefined,
    zone: params.get("zone")?.trim() || undefined,
    managementType: params.get("managementType")?.trim() || undefined,
    result: params.get("result")?.trim() || undefined,
    prelegalOnly: params.get("prelegalOnly") === "1",
    morosoOnly: params.get("morosoOnly") !== "0",
  };
}

function customerZoneWhere(zone?: string) {
  return zone ? { zone } : {};
}

function actionDateWhere(filters: CollectionReportFilters) {
  if (!filters.from && !filters.to) return undefined;
  const actionDate: { gte?: Date; lte?: Date } = {};
  if (filters.from) actionDate.gte = filters.from;
  if (filters.to) actionDate.lte = filters.to;
  return actionDate;
}

function paymentDateWhere(filters: CollectionReportFilters) {
  if (!filters.from && !filters.to) return undefined;
  const paymentDate: { gte?: Date; lte?: Date } = {};
  if (filters.from) paymentDate.gte = filters.from;
  if (filters.to) paymentDate.lte = filters.to;
  return paymentDate;
}

async function buildKpis(filters: CollectionReportFilters): Promise<CollectionReportKpis> {
  const morosoWhere = {
    pendingBalance: { gt: 0 },
    inCollectionWhitelist: false,
    ...customerZoneWhere(filters.zone),
  };

  const morosos = await prisma.customer.findMany({
    where: morosoWhere,
    select: {
      pendingBalance: true,
      overdueSince: true,
    },
  });

  const clientesMorosos = morosos.length;
  const carteraPendiente =
    Math.round(morosos.reduce((s, c) => s + Number(c.pendingBalance), 0) * 100) / 100;
  const prelegalCount = morosos.filter((c) =>
    isPrelegalOverdue({
      pendingBalance: Number(c.pendingBalance),
      overdueSince: c.overdueSince,
    })
  ).length;

  const actionWhere = {
    ...(actionDateWhere(filters) ? { actionDate: actionDateWhere(filters) } : {}),
    ...(filters.managementType ? { managementType: filters.managementType as never } : {}),
    ...(filters.result ? { result: filters.result as never } : {}),
    customer: customerZoneWhere(filters.zone),
  };

  const gestiones = await prisma.collectionAction.findMany({
    where: actionWhere,
    select: { managementType: true, result: true },
  });

  const gestionesPeriodo = gestiones.length;

  const byManagementTypeMap: Record<string, number> = {};
  const byResultMap: Record<string, number> = {};
  for (const g of gestiones) {
    byManagementTypeMap[g.managementType] = (byManagementTypeMap[g.managementType] ?? 0) + 1;
    byResultMap[g.result] = (byResultMap[g.result] ?? 0) + 1;
  }

  const paymentWhere = {
    ...(paymentDateWhere(filters) ? { paymentDate: paymentDateWhere(filters) } : {}),
    customer: customerZoneWhere(filters.zone),
  };

  const pagos = await prisma.collectionPayment.findMany({
    where: paymentWhere,
    select: { amount: true },
  });

  const pagosPeriodo = pagos.length;
  const montoPagosPeriodo =
    Math.round(pagos.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;

  const today = startOfDay(new Date());
  const promesasVigentes = await prisma.collectionAction.count({
    where: {
      result: "PROMESA_DE_PAGO",
      promiseDate: { gte: today },
      customer: {
        pendingBalance: { gt: 0 },
        ...customerZoneWhere(filters.zone),
      },
    },
  });

  return {
    clientesMorosos,
    carteraPendiente,
    gestionesPeriodo,
    pagosPeriodo,
    montoPagosPeriodo,
    promesasVigentes,
    prelegalCount,
    byManagementType: Object.entries(byManagementTypeMap).map(([type, count]) => ({
      type,
      label: COLLECTION_TYPE_LABELS[type] ?? type,
      count,
    })),
    byResult: Object.entries(byResultMap).map(([result, count]) => ({
      result,
      label: COLLECTION_RESULT_LABELS[result] ?? result,
      count,
    })),
  };
}

async function reportCartera(filters: CollectionReportFilters): Promise<CarteraReportRow[]> {
  const customers = await prisma.customer.findMany({
    where: {
      ...(filters.morosoOnly !== false ? { pendingBalance: { gt: 0 } } : {}),
      inCollectionWhitelist: false,
      ...customerZoneWhere(filters.zone),
    },
    include: {
      collectionCharges: { orderBy: { createdAt: "asc" } },
      collectionActions: {
        orderBy: { actionDate: "desc" },
        take: 1,
        select: { actionDate: true, result: true },
      },
    },
    orderBy: [{ overdueSince: "asc" }, { contract: "asc" }],
  });

  const rows = customers.map((customer) => {
    const pendingBalance = Number(customer.pendingBalance);
    const overdueDays = getOverdueDays({
      pendingBalance,
      overdueSince: customer.overdueSince,
    });
    const isPrelegal = isPrelegalOverdue({
      pendingBalance,
      overdueSince: customer.overdueSince,
    });
    const lastAction = customer.collectionActions[0];
    const chargesTotal =
      Math.round(
        customer.collectionCharges.reduce((s, c) => s + Number(c.amount), 0) * 100
      ) / 100;
    const chargesSummary =
      customer.collectionCharges.length === 0
        ? "—"
        : customer.collectionCharges
            .map((c) => {
              const label = COLLECTION_CHARGE_TYPE_LABELS[c.chargeType] ?? c.chargeType;
              return `${label}: ${formatChargeDetail(c)} (${Number(c.amount).toFixed(2)})`;
            })
            .join(" · ");

    return {
      customerId: customer.id,
      contract: customer.contract,
      name: customer.name,
      zone: customer.zone,
      phone: customer.phone,
      planName: customer.planName,
      pendingBalance,
      overdueDays,
      overdueSince: customer.overdueSince?.toISOString() ?? null,
      inCollectionWhitelist: customer.inCollectionWhitelist,
      isPrelegal,
      chargesSummary,
      chargesTotal,
      lastActionDate: lastAction?.actionDate.toISOString() ?? null,
      lastActionResult: lastAction
        ? COLLECTION_RESULT_LABELS[lastAction.result] ?? lastAction.result
        : null,
    };
  });

  if (filters.prelegalOnly) {
    return rows.filter((r) => r.isPrelegal);
  }

  if (filters.from || filters.to) {
    return rows.filter((row) => {
      if (!row.lastActionDate) return false;
      const d = new Date(row.lastActionDate);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      return true;
    });
  }

  return rows;
}

async function reportGestiones(filters: CollectionReportFilters): Promise<GestionReportRow[]> {
  const actions = await prisma.collectionAction.findMany({
    where: {
      ...(actionDateWhere(filters) ? { actionDate: actionDateWhere(filters) } : {}),
      ...(filters.managementType ? { managementType: filters.managementType as never } : {}),
      ...(filters.result ? { result: filters.result as never } : {}),
      customer: customerZoneWhere(filters.zone),
    },
    include: {
      customer: {
        select: {
          contract: true,
          name: true,
          zone: true,
          pendingBalance: true,
          overdueSince: true,
        },
      },
      user: { select: { name: true } },
    },
    orderBy: { actionDate: "desc" },
  });

  const rows = actions.map((action) => {
    const pendingBalance = Number(action.customer.pendingBalance);
    const overdueDays = getOverdueDays({
      pendingBalance,
      overdueSince: action.customer.overdueSince,
    });

    return {
      id: action.id,
      actionDate: action.actionDate.toISOString(),
      contract: action.customer.contract,
      customerName: action.customer.name,
      zone: action.customer.zone,
      pendingBalance,
      overdueDays,
      managementType: action.managementType,
      managementTypeLabel: COLLECTION_TYPE_LABELS[action.managementType] ?? action.managementType,
      result: action.result,
      resultLabel: COLLECTION_RESULT_LABELS[action.result] ?? action.result,
      userName: action.agentName,
      agentName: action.agentName,
      registeredBy: action.user.name,
      nextFollowUpDate: action.nextFollowUpDate?.toISOString() ?? null,
      promiseDate: action.promiseDate?.toISOString() ?? null,
      promiseAmount: action.promiseAmount ? Number(action.promiseAmount) : null,
      notes: action.notes,
    };
  });

  if (filters.prelegalOnly) {
    return rows.filter((r) => r.overdueDays >= PRELEGAL_OVERDUE_DAYS);
  }

  return rows;
}

async function reportPagos(filters: CollectionReportFilters): Promise<PagoReportRow[]> {
  const payments = await prisma.collectionPayment.findMany({
    where: {
      ...(paymentDateWhere(filters) ? { paymentDate: paymentDateWhere(filters) } : {}),
      customer: customerZoneWhere(filters.zone),
    },
    include: {
      customer: { select: { contract: true, name: true, zone: true } },
      user: { select: { name: true } },
    },
    orderBy: { paymentDate: "desc" },
  });

  return payments.map((payment) => ({
    id: payment.id,
    paymentDate: payment.paymentDate.toISOString(),
    contract: payment.customer.contract,
    customerName: payment.customer.name,
    zone: payment.customer.zone,
    amount: Number(payment.amount),
    fenixDocument: payment.fenixDocument,
    paymentMethod: payment.paymentMethod,
    userName: payment.user.name,
    notes: payment.notes,
  }));
}

export async function getCollectionReport(
  filters: CollectionReportFilters
): Promise<CollectionReportResult> {
  const kpis = await buildKpis(filters);

  let rows: CarteraReportRow[] | GestionReportRow[] | PagoReportRow[];
  if (filters.view === "gestiones") {
    rows = await reportGestiones(filters);
  } else if (filters.view === "pagos") {
    rows = await reportPagos(filters);
  } else {
    rows = await reportCartera(filters);
  }

  return {
    filters: {
      view: filters.view,
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
      zone: filters.zone ?? null,
      managementType: filters.managementType ?? null,
      result: filters.result ?? null,
      prelegalOnly: filters.prelegalOnly ?? false,
      morosoOnly: filters.morosoOnly !== false,
    },
    kpis,
    rows,
  };
}

export function collectionReportToCsv(report: CollectionReportResult): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines: string[] = [];

  if (report.filters.view === "cartera") {
    lines.push(
      [
        "Contrato",
        "Cliente",
        "Zona",
        "Teléfono",
        "Plan",
        "Saldo USD",
        "Días mora",
        "Inicio mora",
        "Prelegal",
        "Detalle cargos",
        "Última gestión",
        "Resultado última gestión",
      ].join(",")
    );
    for (const row of report.rows as CarteraReportRow[]) {
      lines.push(
        [
          row.contract,
          row.name,
          row.zone,
          row.phone ?? "",
          row.planName,
          row.pendingBalance.toFixed(2),
          row.overdueDays,
          row.overdueSince ? new Date(row.overdueSince).toLocaleDateString("es-VE") : "",
          row.isPrelegal ? "Sí" : "No",
          row.chargesSummary,
          row.lastActionDate ? new Date(row.lastActionDate).toLocaleDateString("es-VE") : "",
          row.lastActionResult ?? "",
        ]
          .map(escape)
          .join(",")
      );
    }
  } else if (report.filters.view === "gestiones") {
    lines.push(
      [
        "Fecha",
        "Contrato",
        "Cliente",
        "Zona",
        "Saldo USD",
        "Días mora",
        "Tipo gestión",
        "Resultado",
        "Agente",
        "Registró en sistema",
        "Próx. seguimiento",
        "Promesa fecha",
        "Promesa monto",
        "Notas",
      ].join(",")
    );
    for (const row of report.rows as GestionReportRow[]) {
      lines.push(
        [
          new Date(row.actionDate).toLocaleString("es-VE"),
          row.contract,
          row.customerName,
          row.zone,
          row.pendingBalance.toFixed(2),
          row.overdueDays,
          row.managementTypeLabel,
          row.resultLabel,
          row.userName,
          row.registeredBy !== row.userName ? row.registeredBy : "",
          row.nextFollowUpDate ? new Date(row.nextFollowUpDate).toLocaleDateString("es-VE") : "",
          row.promiseDate ? new Date(row.promiseDate).toLocaleDateString("es-VE") : "",
          row.promiseAmount != null ? row.promiseAmount.toFixed(2) : "",
          row.notes ?? "",
        ]
          .map(escape)
          .join(",")
      );
    }
  } else {
    lines.push(
      [
        "Fecha",
        "Contrato",
        "Cliente",
        "Zona",
        "Valor USD",
        "Recibo Fenix",
        "Método",
        "Registró",
        "Notas",
      ].join(",")
    );
    for (const row of report.rows as PagoReportRow[]) {
      lines.push(
        [
          new Date(row.paymentDate).toLocaleDateString("es-VE"),
          row.contract,
          row.customerName,
          row.zone,
          row.amount.toFixed(2),
          row.fenixDocument,
          row.paymentMethod ?? "",
          row.userName,
          row.notes ?? "",
        ]
          .map(escape)
          .join(",")
      );
    }
  }

  return `\uFEFF${lines.join("\r\n")}`;
}
