import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  APP_NAME,
  COLLECTION_MANAGEMENT_TYPES,
  COLLECTION_RESULTS,
} from "@/lib/constants";

const NAVY = [11, 31, 58] as const;
const BRAND = [0, 169, 181] as const;
const MARGIN = 14;
const LINE = 5;

function addFooter(doc: jsPDF, page: number, total: number) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`${APP_NAME} — Manual Gestión de Cobranza`, MARGIN, h - 8);
  doc.text(`Página ${page} de ${total}`, w - MARGIN, h - 8, { align: "right" });
}

function writeParagraph(doc: jsPDF, text: string, y: number, maxWidth = 180) {
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, MARGIN, y);
  return y + lines.length * LINE + 2;
}

function writeHeading(doc: jsPDF, text: string, y: number, size = 12) {
  doc.setFontSize(size);
  doc.setTextColor(...NAVY);
  doc.text(text, MARGIN, y);
  return y + size * 0.45 + 4;
}

function writeSubheading(doc: jsPDF, text: string, y: number) {
  doc.setFontSize(10);
  doc.setTextColor(...BRAND);
  doc.text(text, MARGIN, y);
  return y + 7;
}

export function generateManualCobranzaPdf(): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text("Manual de uso", pageWidth / 2, y, { align: "center" });
  y += 10;
  doc.setFontSize(14);
  doc.setTextColor(...BRAND);
  doc.text("Gestión de Cobranza", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(APP_NAME, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(`Versión del manual: ${new Date().toLocaleDateString("es-VE")}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 14;

  y = writeHeading(doc, "1. Objetivo", y);
  y = writeParagraph(
    doc,
    "La Gestión de Cobranza es una etapa obligatoria dentro del módulo de Bajas. Permite registrar " +
      "contactos con clientes morosos (llamadas, WhatsApp, visitas, etc.) antes de enviar al cliente " +
      "al proceso formal de baja. Todo queda auditado con usuario, fecha, hora e IP.",
    y
  );

  y = writeHeading(doc, "2. Acceso al sistema", y);
  y = writeParagraph(
    doc,
    "URL de producción: https://infinity-bajas-v3vn.onrender.com/login\n" +
      "Usuarios con acceso a cobranza: Administrador y Supervisor (menú «Clientes · Cobranza»). " +
      "El rol Técnico no tiene acceso a esta sección.",
    y
  );

  autoTable(doc, {
    startY: y,
    head: [["Usuario", "Contraseña", "Rol"]],
    body: [
      ["admin@infinity.net", "admin2010", "Administrador"],
      ["supervisor@infinity.net", "admin2010", "Supervisor"],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [11, 31, 58], textColor: 255 },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  y = writeHeading(doc, "3. Flujo operativo", y);
  y = writeParagraph(
    doc,
    "Cliente moroso → Gestión de Cobranza → Promesa / Convenio / Pago → " +
      "Si paga: finaliza la gestión. Si no paga y no hay bloqueos: Enviar a Baja.",
    y
  );

  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const flow = [
    "1. Ingresar al sistema",
    "2. Menú lateral: Clientes · Cobranza",
    "3. En la tabla, clic en Cobranza → del cliente",
    "4. Pestaña Gestión de Cobranza (se abre por defecto)",
    "5. Registrar cada gestión realizada",
    "6. Cuando no haya bloqueos, usar Enviar a Baja",
  ];
  flow.forEach((line) => {
    doc.text(line, MARGIN + 2, y);
    y += LINE;
  });
  y += 6;

  y = writeHeading(doc, "4. Registrar una gestión", y);
  y = writeParagraph(
    doc,
    "Complete el formulario «Registrar gestión» y pulse el botón Registrar gestión. " +
      "Los campos marcados con * son obligatorios cuando aplica.",
    y
  );

  autoTable(doc, {
    startY: y,
    head: [["Campo", "Descripción"]],
    body: [
      ["Fecha y hora", "Momento en que se realizó la gestión"],
      ["Tipo de gestión", "Canal usado: llamada, WhatsApp, visita, etc."],
      ["Resultado", "Desenlace del contacto (ver tabla siguiente)"],
      ["Próxima fecha de gestión", "Opcional — para programar seguimiento"],
      ["Observaciones", "Detalle libre de la conversación o visita"],
      ["Adjunto / Fotografía", "Opcional — máximo 500 KB cada uno"],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 31, 58], textColor: 255 },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  y = writeSubheading(doc, "Tipos de gestión", y);
  autoTable(doc, {
    startY: y,
    head: [["Código", "Nombre"]],
    body: COLLECTION_MANAGEMENT_TYPES.map((t) => [t.value, t.label]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 169, 181], textColor: 255 },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  y = writeSubheading(doc, "Resultados posibles", y);
  const resultHelp: Record<string, string> = {
    CONTESTO: "Contacto exitoso",
    NO_CONTESTO: "Sin contacto — programar nueva gestión",
    PROMESA_DE_PAGO: "Requiere fecha compromiso y valor en USD",
    PAGO: "Finaliza gestión — no procede baja",
    CONVENIO: "Bloquea baja hasta resolver convenio",
    SE_NIEGA_A_PAGAR: "Cliente rechaza pago — evaluar baja",
    CLIENTE_NO_UBICADO: "No se localizó al cliente",
  };
  autoTable(doc, {
    startY: y,
    head: [["Resultado", "Efecto"]],
    body: COLLECTION_RESULTS.map((r) => [r.label, resultHelp[r.value] ?? ""]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 31, 58], textColor: 255 },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.addPage();
  y = 20;

  y = writeHeading(doc, "5. Promesa de pago", y);
  y = writeParagraph(
    doc,
    "Si el resultado es «Promesa de Pago», el sistema muestra campos adicionales obligatorios: " +
      "fecha compromiso, valor en USD y observaciones de la promesa. Mientras la promesa esté vigente " +
      "(fecha igual o posterior a hoy), el botón Enviar a Baja permanece bloqueado.",
    y
  );

  y = writeHeading(doc, "6. Enviar a Baja", y);
  y = writeParagraph(
    doc,
    "El panel «Enviar a Baja» aparece en la parte superior derecha de la ficha del cliente. " +
      "Solo se habilita cuando no existen bloqueos activos.",
    y
  );

  autoTable(doc, {
    startY: y,
    head: [["Situación", "¿Permite baja?"]],
    body: [
      ["Sin gestiones pendientes ni bloqueos", "Sí"],
      ["Promesa de pago vigente", "No — espere vencimiento o registre nuevo resultado"],
      ["Convenio activo (última gestión)", "No — resuelva el convenio primero"],
      ["Pago registrado en cobranza", "No — gestión finalizada por pago"],
      ["Reclamo técnico abierto", "No — desmarque en pestaña Datos del cliente"],
      ["Cliente ya tiene baja registrada", "No"],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 31, 58], textColor: 255 },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  y = writeHeading(doc, "7. Historial y auditoría", y);
  y = writeParagraph(
    doc,
    "Todas las gestiones quedan en la tabla «Historial de gestiones» con fecha, hora, usuario, " +
      "tipo, resultado y observaciones. El sistema registra auditoría en base de datos (acción COLLECTION) " +
      "con dirección IP del operador.",
    y
  );

  y = writeHeading(doc, "8. Pestaña Datos del cliente", y);
  y = writeParagraph(
    doc,
    "En esta pestaña puede consultar plan, dirección, equipos y marcar «Reclamo técnico abierto». " +
      "Si está activo, bloquea el envío a baja hasta resolver el reclamo.",
    y
  );

  y = writeHeading(doc, "9. Atajos desde el módulo Bajas", y);
  y = writeParagraph(
    doc,
    "• Nueva baja: al seleccionar un cliente aparece enlace a Gestión de Cobranza.\n" +
      "• Importante: el enlace «Ver baja →» en la lista de Bajas abre el detalle de una solicitud " +
      "ya creada; NO es la pantalla de cobranza.\n" +
      "• La cobranza siempre se gestiona desde Clientes · Cobranza → Cobranza →.",
    y
  );

  y = writeHeading(doc, "10. Solución de problemas", y);
  autoTable(doc, {
    startY: y,
    head: [["Problema", "Qué hacer"]],
    body: [
      ["No veo el menú Clientes", "Use usuario Admin o Supervisor; Técnico no tiene acceso"],
      ["No hay clientes en la lista", "Cree uno con + Nuevo cliente"],
      ["Botón Enviar a Baja bloqueado", "Revise la lista de bloqueos en el panel superior"],
      ["Error al guardar promesa", "Complete fecha compromiso y valor USD"],
      ["Archivo no se adjunta", "Máximo 500 KB por adjunto o foto"],
      ["Pantalla antigua / sin cambios", "Recargue con Ctrl+Shift+R o cierre sesión y vuelva a entrar"],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 169, 181], textColor: 255 },
    margin: { left: MARGIN, right: MARGIN },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(doc, p, totalPages);
  }

  return doc;
}

export function manualCobranzaPdfBuffer(): Buffer {
  return Buffer.from(generateManualCobranzaPdf().output("arraybuffer"));
}
