import type { PermissionCode } from "@/config/permisos";

/** Trabajos específicos que exigen DC-3 (espejo de `tipos_trabajo` en esquema.sql). */
export const workTypes = [
  { code: "CALIENTES", label: "Trabajos calientes", permitTypeSlug: "trabajos-calientes" },
  { code: "ALTURAS", label: "Trabajos en alturas", permitTypeSlug: "trabajos-en-alturas" },
  { code: "CONFINADOS", label: "Espacios confinados", permitTypeSlug: "espacios-confinados" },
] as const;

export type WorkTypeCode = (typeof workTypes)[number]["code"];

export function is_work_type_code(value: string): value is WorkTypeCode {
  return workTypes.some((type) => type.code === value);
}

export type DocumentTypeCode =
  | "IMSS_ALTA"
  | "IMSS_PAGO_PROVEEDOR"
  | "EXAMEN_MEDICO"
  | "INDUCCION"
  | "DC3_CALIENTES"
  | "DC3_ALTURAS"
  | "DC3_CONFINADOS"
  | "CERT_CALIDAD"
  | "PROG_MANTENIMIENTO"
  | "POLIZA_SEGURO"
  | "VERIF_VEHICULAR"
  | "TENENCIA_VEHICULAR";

export type DocumentSubjectKind = "EMPLEADO_PROVEEDOR" | "EQUIPO" | "PROVEEDOR";

export interface DocumentTypeDefinition {
  code: DocumentTypeCode;
  label: string;
  appliesTo: DocumentSubjectKind;
  category: "IMSS" | "MEDICO" | "CAPACITACION" | "CERTIFICACION";
  /** true: lo exige a todo el personal / equipo. false: solo si se declara el trabajo ligado. */
  mandatory: boolean;
  /** Meses de vigencia desde la emisión; null si no caduca por sí mismo. */
  validityMonths: number | null;
  /** DC-3 de un trabajo específico; se exige solo si el colaborador lo declaró. */
  workTypeCode: WorkTypeCode | null;
  /** Permiso que debe tener quien revisa (el médico es distinto del de HSEA). */
  reviewPermission: PermissionCode;
}

/** Catálogo de documentos (espejo de `tipos_documento` en esquema.sql). */
export const documentTypes: DocumentTypeDefinition[] = [
  {
    code: "IMSS_ALTA",
    label: "Alta / datos del IMSS",
    appliesTo: "EMPLEADO_PROVEEDOR",
    category: "IMSS",
    mandatory: true,
    validityMonths: null,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    // Lo sube el proveedor (persona moral), no cada colaborador; cuenta para el semáforo de todo su personal.
    // Sin periodicidad definida por ahora. Sustituye al antiguo IMSS_PAGO por colaborador (desactivado en BD).
    code: "IMSS_PAGO_PROVEEDOR",
    label: "Comprobante de pago del IMSS",
    appliesTo: "PROVEEDOR",
    category: "IMSS",
    mandatory: true,
    validityMonths: null,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "EXAMEN_MEDICO",
    label: "Examen y certificado médico (anual)",
    appliesTo: "EMPLEADO_PROVEEDOR",
    category: "MEDICO",
    mandatory: true,
    validityMonths: 12,
    workTypeCode: null,
    reviewPermission: "contratistas:validar_medico",
  },
  {
    code: "INDUCCION",
    label: "Curso de inducción (vigencia 2 años)",
    appliesTo: "EMPLEADO_PROVEEDOR",
    category: "CAPACITACION",
    mandatory: true,
    validityMonths: 24,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "DC3_CALIENTES",
    label: "DC-3 trabajos calientes",
    appliesTo: "EMPLEADO_PROVEEDOR",
    category: "CERTIFICACION",
    mandatory: false,
    validityMonths: null,
    workTypeCode: "CALIENTES",
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "DC3_ALTURAS",
    label: "DC-3 trabajos en alturas",
    appliesTo: "EMPLEADO_PROVEEDOR",
    category: "CERTIFICACION",
    mandatory: false,
    validityMonths: null,
    workTypeCode: "ALTURAS",
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "DC3_CONFINADOS",
    label: "DC-3 espacios confinados",
    appliesTo: "EMPLEADO_PROVEEDOR",
    category: "CERTIFICACION",
    mandatory: false,
    validityMonths: null,
    workTypeCode: "CONFINADOS",
    reviewPermission: "contratistas:revisar_documentos",
  },
  // Equipos motorizados: los cinco documentos son obligatorios para cada equipo.
  {
    code: "CERT_CALIDAD",
    label: "Certificado de calidad",
    appliesTo: "EQUIPO",
    category: "CERTIFICACION",
    mandatory: true,
    validityMonths: null,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "PROG_MANTENIMIENTO",
    label: "Programa de mantenimiento",
    appliesTo: "EQUIPO",
    category: "CERTIFICACION",
    mandatory: true,
    validityMonths: null,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "POLIZA_SEGURO",
    label: "Póliza de seguro",
    appliesTo: "EQUIPO",
    category: "CERTIFICACION",
    mandatory: true,
    validityMonths: 12,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "VERIF_VEHICULAR",
    label: "Verificación vehicular",
    appliesTo: "EQUIPO",
    category: "CERTIFICACION",
    mandatory: true,
    validityMonths: 6,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
  {
    code: "TENENCIA_VEHICULAR",
    label: "Tenencia vehicular",
    appliesTo: "EQUIPO",
    category: "CERTIFICACION",
    mandatory: true,
    validityMonths: 12,
    workTypeCode: null,
    reviewPermission: "contratistas:revisar_documentos",
  },
];

export function find_document_type(code: string): DocumentTypeDefinition | undefined {
  return documentTypes.find((type) => type.code === code);
}

/** Reglas de los archivos subidos (el almacenamiento real se define aparte). */
export const maxDocumentFileBytes = 10 * 1024 * 1024;
export const allowedDocumentMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
