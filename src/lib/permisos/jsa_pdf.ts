import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import {
  get_jsa_participants,
  get_jsa_selected_risk_ids,
  get_jsa_steps,
  get_participant_key,
  jsaApprovalSignatures,
  jsaChecklists,
  jsaEnvironmental,
  jsaHazards,
  jsaInitialSteps,
  jsaPermitQuestions,
  jsaRiskIds,
} from "@/config/jsa";
import type { WorkPermit } from "@/domain/permisos";
import {
  checklistBoxes,
  environmentalBoxes,
  hazardBoxes,
  noPermitBox,
  permitQuestionBoxes,
  riskBoxes,
  type PdfBox,
} from "./jsa_pdf_casillas";

/** Plantilla controlada FO-0066; se lee del disco al generar (no se expone en `public`). */
const templatePath = path.join(process.cwd(), "plantillas", "FO-0066_JSA.pdf");

const pageHeight = 1008;
const ink = rgb(0.05, 0.08, 0.2);

/** Rectángulo en puntos con origen arriba a la izquierda (como los mide la plantilla). */
interface Cell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Fronteras de la tabla "Análisis del trabajo" de la plantilla (página 1). */
const stepRowEdges = [260.0, 294.8, 335.5, 370.2, 399.8, 439.5, 473.8, 500.8, 527.8, 554.8, 581.8, 608.8, 636.2];
const stepColumns = {
  description: [86.8, 239.0],
  hazards: [239.0, 295.5],
  controls: [295.5, 431.8],
  probability: [431.8, 479.2],
  severity: [479.2, 521.0],
  risk: [521.0, 569.5],
} as const;

/** Participantes (6 filas de 14.5 pt desde 767.2) y aprobaciones. */
const participantRowTop = 767.2;
const participantRowHeight = 14.5;
const participantColumns = { name: [60.5, 190.0], job: [190.0, 320.5], company: [320.5, 431.8], signature: [431.8, 568.5] } as const;
const approvalRows: Record<string, [number, number]> = {
  executor: [868.5, 892.5],
  operational_manager: [892.5, 918.8],
  hsea: [918.8, 935.5],
};
const approvalColumns = { name: [189.5, 320.0], signature: [320.0, 431.2], date: [431.2, 569.0] } as const;

export interface JsaPdfContext {
  /** Nombre completo de quien firmó, por número de empleado o id de actor; si no se conoce se imprime el id. */
  resolve_signer_name: (actorId: string) => Promise<string>;
}

function to_top_y(top: number): number {
  return pageHeight - top;
}

/** Texto que la fuente estándar (WinAnsi) sí puede dibujar: lo demás se sustituye por "?". */
function make_sanitizer(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text) =>
    Array.from(text.replace(/\s+/g, " ").trim())
      .map((char) => (supported.has(char.codePointAt(0) ?? 0) ? char : "?"))
      .join("");
}

function wrap_text(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    let remaining = word;
    // Una palabra más ancha que la celda se parte por caracteres.
    while (font.widthOfTextAtSize(remaining, size) > maxWidth && remaining.length > 1) {
      let cut = remaining.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(remaining.slice(0, cut), size) > maxWidth) cut -= 1;
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    const candidate = current ? `${current} ${remaining}` : remaining;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = remaining;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface FitOptions {
  maxSize: number;
  minSize?: number;
  align?: "left" | "center";
}

/** Escribe `text` dentro de la celda, reduciendo la letra hasta que quepa; si aun así no cabe, la recorta con "...". */
function draw_fitted(page: PDFPage, font: PDFFont, sanitize: (text: string) => string, text: string, cell: Cell, options: FitOptions): void {
  const clean = sanitize(text);
  if (!clean) return;
  const padding = 2;
  const maxWidth = cell.x1 - cell.x0 - padding * 2;
  const maxHeight = cell.y1 - cell.y0 - 2;
  const minSize = options.minSize ?? 4.5;

  let size = options.maxSize;
  let lines = wrap_text(clean, font, size, maxWidth);
  while (size > minSize && lines.length * size * 1.15 > maxHeight) {
    size = Math.max(minSize, size - 0.25);
    lines = wrap_text(clean, font, size, maxWidth);
  }
  const lineHeight = size * 1.15;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1] ?? "";
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}...`;
  }

  const blockHeight = lines.length * lineHeight;
  const firstBaselineTop = cell.y0 + (cell.y1 - cell.y0 - blockHeight) / 2 + size * 0.95;
  lines.forEach((line, index) => {
    const width = font.widthOfTextAtSize(line, size);
    const x = options.align === "center" ? cell.x0 + (cell.x1 - cell.x0 - width) / 2 : cell.x0 + padding;
    page.drawText(line, { x, y: to_top_y(firstBaselineTop + index * lineHeight), size, font, color: ink });
  });
}

/** Marca una casilla de la plantilla con una "X". */
function draw_check(page: PDFPage, box: PdfBox | undefined): void {
  if (!box) return;
  const [x0, y0, x1, y1] = box;
  const grow = 0.5;
  const options = { thickness: 1.1, color: ink };
  page.drawLine({ start: { x: x0 - grow, y: to_top_y(y0 - grow) }, end: { x: x1 + grow, y: to_top_y(y1 + grow) }, ...options });
  page.drawLine({ start: { x: x0 - grow, y: to_top_y(y1 + grow) }, end: { x: x1 + grow, y: to_top_y(y0 - grow) }, ...options });
}

const levelColors: RGB[] = [rgb(0.57, 0.82, 0.31), rgb(1, 0.95, 0.2), rgb(1, 0.65, 0.15), rgb(0.9, 0.1, 0.1)];

function get_level_color(level: number): RGB {
  return levelColors[Math.min(Math.max(level, 1), 4) - 1] ?? rgb(1, 1, 1);
}

function get_risk_color(risk: number): RGB {
  return get_level_color(risk <= 4 ? 1 : risk <= 8 ? 2 : risk <= 12 ? 3 : 4);
}

function fill_cell(page: PDFPage, cell: Cell, color: RGB): void {
  const inset = 1.2;
  page.drawRectangle({
    x: cell.x0 + inset,
    y: to_top_y(cell.y1 - inset),
    width: cell.x1 - cell.x0 - inset * 2,
    height: cell.y1 - cell.y0 - inset * 2,
    color,
  });
}

function format_date(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? "");
}

function format_signed_at(iso: string): string {
  return new Date(iso).toLocaleString("es-MX");
}

async function embed_signature(pdf: PDFDocument, image: string | null | undefined): Promise<PDFImage | null> {
  const prefix = "data:image/png;base64,";
  if (!image?.startsWith(prefix)) return null;
  try {
    return await pdf.embedPng(Buffer.from(image.slice(prefix.length), "base64"));
  } catch {
    return null;
  }
}

function draw_signature_image(page: PDFPage, image: PDFImage, cell: Cell): void {
  const maxWidth = cell.x1 - cell.x0 - 6;
  const maxHeight = cell.y1 - cell.y0 - 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: cell.x0 + (cell.x1 - cell.x0 - width) / 2,
    y: to_top_y(cell.y0 + (cell.y1 - cell.y0 + height) / 2),
    width,
    height,
  });
}

/** Página extra con la misma tabla cuando el JSA tiene más pasos de los que caben en la plantilla. */
function draw_continuation_page(
  pdf: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  sanitize: (text: string) => string,
  folio: string,
  steps: ReturnType<typeof get_jsa_steps>,
): void {
  const page = pdf.addPage([612, pageHeight]);
  page.drawText(sanitize(`FO-0066 Análisis de seguridad en el trabajo (JSA) - Continuación - Folio ${folio}`), {
    x: 60.5,
    y: to_top_y(50),
    size: 10,
    font: bold,
    color: ink,
  });
  const columns: [string, number, number][] = [
    ["No", 60.5, 86.8],
    ["Pasos del trabajo", 86.8, 239],
    ["N° Peligro", 239, 295.5],
    ["Medidas de control", 295.5, 431.8],
    ["Probabilidad", 431.8, 479.2],
    ["Severidad", 479.2, 521],
    ["Riesgo", 521, 569.5],
  ];
  const headerTop = 70;
  const headerHeight = 22;
  const rowHeight = 40;
  const line = { thickness: 0.6, color: rgb(0.2, 0.2, 0.2) };
  const bottom = headerTop + headerHeight + rowHeight * steps.length;

  page.drawRectangle({
    x: 60.5,
    y: to_top_y(headerTop + headerHeight),
    width: 569 - 60.5,
    height: headerHeight,
    color: rgb(0.85, 0.85, 0.85),
  });
  for (const [label, x0, x1] of columns) {
    draw_fitted(page, bold, sanitize, label, { x0, y0: headerTop, x1, y1: headerTop + headerHeight }, { maxSize: 6.5, align: "center" });
  }
  for (let index = 0; index <= steps.length + 1; index += 1) {
    const top = index === 0 ? headerTop : headerTop + headerHeight + rowHeight * (index - 1);
    page.drawLine({ start: { x: 60.5, y: to_top_y(top) }, end: { x: 569.5, y: to_top_y(top) }, ...line });
  }
  for (const [, x0] of columns) page.drawLine({ start: { x: x0, y: to_top_y(headerTop) }, end: { x: x0, y: to_top_y(bottom) }, ...line });
  page.drawLine({ start: { x: 569.5, y: to_top_y(headerTop) }, end: { x: 569.5, y: to_top_y(bottom) }, ...line });

  steps.forEach((step, index) => {
    const y0 = headerTop + headerHeight + rowHeight * index;
    const y1 = y0 + rowHeight;
    const cell = (x0: number, x1: number): Cell => ({ x0, y0, x1, y1 });
    draw_fitted(page, bold, sanitize, String(step.number), cell(60.5, 86.8), { maxSize: 9, align: "center" });
    draw_fitted(page, font, sanitize, step.description, cell(...stepColumns.description), { maxSize: 7 });
    draw_fitted(page, font, sanitize, step.hazards, cell(...stepColumns.hazards), { maxSize: 7, align: "center" });
    draw_fitted(page, font, sanitize, step.controls, cell(...stepColumns.controls), { maxSize: 7 });
    for (const [column, value, color] of [
      [stepColumns.probability, step.probability, get_level_color(step.probability)],
      [stepColumns.severity, step.severity, get_level_color(step.severity)],
      [stepColumns.risk, step.risk, get_risk_color(step.risk)],
    ] as const) {
      const target = cell(column[0], column[1]);
      fill_cell(page, target, color);
      draw_fitted(page, bold, sanitize, String(value), target, { maxSize: 9, align: "center" });
    }
  });
}

/** Llena la plantilla FO-0066 con los datos del JSA y devuelve el PDF. */
export async function build_jsa_pdf(permit: WorkPermit, context: JsaPdfContext): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await readFile(templatePath));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sanitize = make_sanitizer(font);
  const [first, second] = pdf.getPages();
  if (!first || !second) throw new Error("La plantilla FO-0066 debe tener dos páginas");
  const fields = permit.fields;
  const folio = String(fields.folio ?? "");

  // Encabezado.
  const get_value_cell = (y0: number, y1: number): Cell => ({ x0: 460, y0, x1: 569, y1 });
  draw_fitted(first, bold, sanitize, folio, get_value_cell(102.8, 114.5), { maxSize: 8 });
  draw_fitted(first, font, sanitize, format_date(fields.date), get_value_cell(114.5, 127.5), { maxSize: 8 });
  draw_fitted(first, font, sanitize, String(fields.time ?? ""), get_value_cell(127.5, 139.0), { maxSize: 8 });
  draw_fitted(first, font, sanitize, String(fields.jobName ?? ""), { x0: 213.5, y0: 139.0, x1: 569, y1: 153.5 }, { maxSize: 8 });
  draw_fitted(first, font, sanitize, String(fields.location ?? ""), { x0: 213.5, y0: 153.5, x1: 368.2, y1: 168.5 }, { maxSize: 8 });
  draw_fitted(first, font, sanitize, String(fields.company ?? ""), { x0: 455.5, y0: 153.5, x1: 569, y1: 168.5 }, { maxSize: 8 });

  // ¿Requiere permiso de trabajo?
  jsaPermitQuestions.forEach((question, index) => {
    const boxes = permitQuestionBoxes[index];
    draw_check(first, fields[question.field] === "yes" ? boxes?.yes : boxes?.no);
  });
  if (!jsaPermitQuestions.some((question) => fields[question.field] === "yes")) draw_check(first, noPermitBox);

  // Análisis del trabajo: los pasos que caben en la plantilla; el resto va en una página de continuación.
  const steps = get_jsa_steps(permit);
  steps.slice(0, jsaInitialSteps).forEach((step, index) => {
    const y0 = stepRowEdges[index];
    const y1 = stepRowEdges[index + 1];
    if (y0 === undefined || y1 === undefined) return;
    const cell = (range: readonly [number, number]): Cell => ({ x0: range[0], y0, x1: range[1], y1 });
    draw_fitted(first, font, sanitize, step.description, cell(stepColumns.description), { maxSize: 7 });
    draw_fitted(first, font, sanitize, step.hazards, cell(stepColumns.hazards), { maxSize: 7, align: "center" });
    draw_fitted(first, font, sanitize, step.controls, cell(stepColumns.controls), { maxSize: 7 });
    for (const [range, value, color] of [
      [stepColumns.probability, step.probability, get_level_color(step.probability)],
      [stepColumns.severity, step.severity, get_level_color(step.severity)],
      [stepColumns.risk, step.risk, get_risk_color(step.risk)],
    ] as const) {
      fill_cell(first, cell(range), color);
      draw_fitted(first, bold, sanitize, String(value), cell(range), { maxSize: 10, align: "center" });
    }
  });

  // Personal que participa (con su firma, si ya firmó).
  for (const participant of get_jsa_participants(permit)) {
    const y0 = participantRowTop + (participant.position - 1) * participantRowHeight;
    const y1 = y0 + participantRowHeight;
    const cell = (range: readonly [number, number]): Cell => ({ x0: range[0], y0, x1: range[1], y1 });
    draw_fitted(first, font, sanitize, participant.name, cell(participantColumns.name), { maxSize: 7.5 });
    draw_fitted(first, font, sanitize, participant.job, cell(participantColumns.job), { maxSize: 7.5 });
    draw_fitted(first, font, sanitize, participant.company, cell(participantColumns.company), { maxSize: 7.5 });
    const signature = permit.signatures.find((item) => item.key === get_participant_key(participant.position));
    const image = await embed_signature(pdf, signature?.image);
    if (image) draw_signature_image(first, image, cell(participantColumns.signature));
  }

  // Aprobaciones.
  for (const approval of jsaApprovalSignatures) {
    const signature = permit.signatures.find((item) => item.key === approval.key);
    if (!signature) continue;
    const rows = approvalRows[approval.key];
    if (!rows) continue;
    const [y0, y1] = rows;
    const cell = (range: readonly [number, number]): Cell => ({ x0: range[0], y0, x1: range[1], y1 });
    draw_fitted(first, font, sanitize, await context.resolve_signer_name(signature.employeeNumber), cell(approvalColumns.name), { maxSize: 7.5 });
    draw_fitted(first, font, sanitize, format_signed_at(signature.signedAt), cell(approvalColumns.date), { maxSize: 7.5, align: "center" });
    const image = await embed_signature(pdf, signature.image);
    if (image) draw_signature_image(first, image, cell(approvalColumns.signature));
  }

  // Reverso: check list, aspectos ambientales, peligros y riesgos.
  const selectedChecklists = String(fields.checklists ?? "").split(",");
  jsaChecklists.forEach((item, index) => {
    if (selectedChecklists.includes(item.slug)) draw_check(second, checklistBoxes[index]);
  });
  const selectedEnvironmental = String(fields.environmental ?? "").split(",");
  jsaEnvironmental.forEach((item, index) => {
    if (selectedEnvironmental.includes(item.slug)) draw_check(second, environmentalBoxes[index]);
  });
  const otherEnvironmental = String(fields.environmentalOther ?? "").trim();
  if (otherEnvironmental) {
    const box = environmentalBoxes[jsaEnvironmental.length];
    draw_check(second, box);
    if (box) draw_fitted(second, font, sanitize, otherEnvironmental, { x0: 104, y0: box[1] - 4, x1: 197, y1: box[3] + 4 }, { maxSize: 7 });
  }
  const selectedRisks = get_jsa_selected_risk_ids(permit);
  jsaHazards.forEach((hazard, index) => {
    if (hazard.risks.some((risk) => selectedRisks.includes(risk.id))) draw_check(second, hazardBoxes[index]);
  });
  jsaRiskIds.forEach((id, index) => {
    if (selectedRisks.includes(id)) draw_check(second, riskBoxes[index]);
  });

  const extraSteps = steps.slice(jsaInitialSteps);
  if (extraSteps.length > 0) draw_continuation_page(pdf, font, bold, sanitize, folio, extraSteps);

  pdf.setTitle(`FO-0066 Análisis de seguridad en el trabajo (JSA) ${folio}`);
  pdf.setCreator("Plataforma de gestión digital HSEA");
  return pdf.save();
}
