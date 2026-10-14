import type { PermitType } from "@/domain/permisos";

/** Catálogo de formatos controlados de HSEA (fuente: archivos FO-xxxx vigentes). */
export const permitTypes: PermitType[] = [
  {
    slug: "trabajos-en-alturas",
    formCode: "FO-0060",
    name: "Permiso para trabajos en alturas",
    description:
      "Trabajos a más de 1.8 m: escaleras, andamios, plataformas, techos y maquinaria.",
    validityHours: null,
    validityNote:
      "Válido solo en la fecha solicitada; después de las 6:00 p.m. se revalida (máx. 4 h).",
    hasChecklist: true,
    signerRoles: ["executor", "medical_service", "operational_manager", "hsea"],
  },
  {
    slug: "trabajos-calientes",
    formCode: "FO-0131",
    name: "Permiso de trabajos calientes",
    description:
      "Soldadura, corte, oxicorte, barrenado, esmerilado y generación de chispas o flama.",
    validityHours: 12,
    validityNote: "Válido por 12 horas.",
    hasChecklist: true,
    // El solicitante queda registrado al crear el permiso; las firmas con PIN son las de autorización.
    signerRoles: ["executor", "tfs_executor", "operational_manager", "hsea"],
  },
  {
    slug: "espacios-confinados",
    formCode: "FO-0234",
    name: "Permiso para entrada a espacios confinados",
    description:
      "Ingreso a espacios confinados Tipo I o II, con monitoreo de atmósfera.",
    validityHours: 8,
    validityNote: "Vigencia de 8 horas (un turno).",
    hasChecklist: true,
    signerRoles: [
      "requester",
      "operational_manager",
      "medical_service",
      "lookout",
      "hsea",
    ],
  },
  {
    slug: "analisis-seguridad-jsa",
    formCode: "FO-0066",
    name: "Análisis de seguridad de los trabajos (JSA)",
    description:
      "Pasos del trabajo, peligros, controles y evaluación de riesgo (P × S).",
    validityHours: null,
    validityNote: "Se llena en sitio antes de la actividad; se actualiza si cambian las condiciones.",
    hasChecklist: true,
    signerRoles: ["executor", "operational_manager", "hsea"],
  },
  {
    slug: "observacion-preventiva-stop",
    formCode: "FO-0059",
    name: "Seguridad en el trabajo por la observación preventiva (STOP)",
    description:
      "Registro de actos inseguros, condiciones inseguras y aspectos ambientales observados.",
    validityHours: null,
    validityNote: "No aplica; es un registro de observación.",
    hasChecklist: false,
    signerRoles: ["observer", "observed", "supervisor"],
  },
  {
    slug: "ingreso-telefono-celular",
    formCode: "FO-0058",
    name: "Autorización de ingreso con teléfono celular a planta TFS",
    description:
      "Oficio que autoriza al personal contratista a ingresar con celular para fines laborales.",
    validityHours: null,
    validityNote: "Vigencia de 6 meses.",
    hasChecklist: false,
    signerRoles: ["requester", "contractor", "hsea"],
  },
];

export function find_permit_type(slug: string): PermitType | undefined {
  return permitTypes.find((permitType) => permitType.slug === slug);
}
