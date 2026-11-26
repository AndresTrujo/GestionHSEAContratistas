import type { PermitType, SignerRole, WorkPermit } from "@/domain/permisos";
import { get_jsa_participants, get_participant_key, jsaSlug } from "./jsa";

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
    signerRoles: ["executor", "operational_manager", "medical_service", "hsea"],
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

/** Secuencia de firmas de autorización por formato, en el mismo orden en que se muestran. */
const approvalSignatureOrder: Partial<Record<string, SignerRole[]>> = {
  "trabajos-calientes": ["executor", "operational_manager", "tfs_executor", "hsea"],
  "trabajos-en-alturas": ["executor", "operational_manager", "medical_service", "hsea"],
  "espacios-confinados": ["requester", "operational_manager", "medical_service", "lookout"],
  "analisis-seguridad-jsa": ["executor", "operational_manager", "hsea"],
};

/** Indica si una firma de autorización es la siguiente que corresponde registrar. */
export function is_next_approval_signature(permit: WorkPermit, key: string): boolean {
  const order = approvalSignatureOrder[permit.permitTypeSlug];
  if (!order) return true;

  const position = order.indexOf(key as SignerRole);
  // Firmas adicionales (verificaciones, participantes y cierre HSEA de confinados)
  // mantienen sus reglas propias y no forman parte de la secuencia de autorización.
  if (position === -1) return true;

  const has_signed = (signatureKey: string) => permit.signatures.some((signature) => signature.key === signatureKey);
  if (!order.slice(0, position).every(has_signed)) return false;

  // AST: el responsable del área y HSE esperan a que todos los participantes hayan firmado.
  if (permit.permitTypeSlug === jsaSlug && key !== "executor") {
    return get_jsa_participants(permit).every((participant) => has_signed(get_participant_key(participant.position)));
  }
  return true;
}
