import type { WorkPermit } from "@/domain/permisos";

/** Estructura del formato FO-0234 (Permiso para entrada a espacios confinados). */
export const confinedSlug = "espacios-confinados";
export const confinedMaxExecutors = 4;
export const confinedValidityHours = 8;
/** Lectura inicial + 4 lecturas posteriores, como en el formato. */
export const confinedReadingCount = 5;

export type ConfinedRiskType = "I" | "II";

export type GasKey = "o2" | "co" | "h2s" | "lel";

export const confinedGases: {
  key: GasKey;
  label: string;
  limitLabel: string;
  unit: string;
}[] = [
  { key: "o2", label: "Oxígeno (O₂)", limitLabel: "19.5 – 23.5 %", unit: "%" },
  { key: "co", label: "Monóxido de carbono (CO)", limitLabel: "< 10 ppm", unit: "ppm" },
  { key: "h2s", label: "Ácido sulfhídrico (H₂S)", limitLabel: "< 1 ppm", unit: "ppm" },
  { key: "lel", label: "Explosividad (%LEL)", limitLabel: "< 10 %", unit: "%" },
];

export function is_out_of_limits(gas: GasKey, value: number): boolean {
  if (gas === "o2") return value < 19.5 || value > 23.5;
  if (gas === "co") return value >= 10;
  if (gas === "h2s") return value >= 1;
  return value >= 10;
}

export function get_reading_field(position: number, gas: GasKey): string {
  return `reading${position}_${gas}`;
}

/** Cantidad de lecturas ya registradas (la inicial cuenta como 1). */
export function get_reading_count(permit: WorkPermit): number {
  let count = 0;
  for (let position = 1; position <= confinedReadingCount; position += 1) {
    if (permit.fields[get_reading_field(position, "o2")] === undefined) break;
    count = position;
  }
  return count;
}

export function is_reading_out_of_limits(permit: WorkPermit, position: number): boolean {
  return confinedGases.some((gas) => {
    const value = permit.fields[get_reading_field(position, gas.key)];
    return typeof value === "number" && is_out_of_limits(gas.key, value);
  });
}

export const confinedRiskCategories = [
  {
    key: "riskAtmosphere",
    title: "Riesgo por atmósfera",
    items: [
      { slug: "asphyxia", label: "Asfixia" },
      { slug: "fire_explosion", label: "Incendio y explosión" },
      { slug: "poisoning", label: "Intoxicación" },
      { slug: "none", label: "No aplica" },
    ],
  },
  {
    key: "riskPhysical",
    title: "Riesgo por agentes físicos",
    items: [
      { slug: "noise", label: "Ruido" },
      { slug: "lighting", label: "Iluminación" },
      { slug: "vibration", label: "Vibraciones" },
      { slug: "humidity", label: "Humedad" },
      { slug: "high_temperature", label: "Temperaturas elevadas" },
      { slug: "none", label: "No aplica" },
    ],
  },
  {
    key: "riskPresence",
    title: "Presencia de riesgos",
    items: [
      { slug: "biological", label: "Biológicos" },
      { slug: "mechanical", label: "Mecánicos" },
      { slug: "electrical", label: "Eléctricos" },
      { slug: "pneumatic", label: "Neumáticos" },
      { slug: "none", label: "No aplica" },
    ],
  },
  {
    key: "riskTask",
    title: "Riesgos derivados de la tarea",
    items: [
      { slug: "heights", label: "Trabajo en alturas" },
      { slug: "hazardous_energy", label: "Energías peligrosas" },
      { slug: "machinery_start", label: "Arranque de maquinaria" },
      { slug: "flow_restart", label: "Restablecer el flujo" },
      { slug: "none", label: "No aplica" },
    ],
  },
  {
    key: "riskCharacteristics",
    title: "Riesgos por características",
    items: [
      { slug: "unstable", label: "Inestable" },
      { slug: "slippery", label: "Resbaloso" },
      { slug: "collapse", label: "Hundimiento" },
      { slug: "none", label: "No aplica" },
    ],
  },
] as const;

export type ConfinedRiskKey = (typeof confinedRiskCategories)[number]["key"];

export const confinedQuestions = [
  { id: "q1", text: "¿Se requiere monitoreo continuo de la atmósfera del espacio confinado?" },
  { id: "q2", text: "¿El espacio confinado se encuentra limpio y sin ningún residuo en el interior?" },
  { id: "q3", text: "¿Se ha realizado el cierre de válvulas, desconexión de interruptores y la purga de líneas o tuberías cargadas?" },
  { id: "q4", text: "¿Se cuenta con un plan de respuesta y equipo de emergencia?" },
  { id: "q5", text: "¿Se cumple con los requisitos LOTO: candados y tarjetas de seguridad de cada ejecutante colocados?" },
  { id: "q6", text: "De realizar trabajos de corte y soldadura en el interior del espacio confinado, ¿se han cubierto los requisitos del permiso para Trabajos Calientes?" },
  { id: "q7", text: "Herramientas y EPP requeridos" },
  { id: "q8", text: "¿Se requiere ventilación forzada de aire al interior del espacio confinado?" },
  { id: "q9", text: "¿Se requiere el uso de instalaciones eléctricas a prueba de explosión y aterrizadas?" },
  { id: "q10", text: "¿Los ejecutantes cuentan con un equipo personal de monitoreo de atmósfera portátil?" },
  { id: "q11", text: "¿La persona que efectúa la función de \"Prevencionista / Vigía\" está en el acceso del espacio confinado?" },
  { id: "q12", text: "¿Se han controlado los riesgos de caída de alturas?" },
] as const;

/** Herramientas y EPP de la pregunta 7 (cada uno con SI / NO / N/A). */
export const confinedEquipment = [
  { id: "e_helmet", label: "Casco" },
  { id: "e_gloves", label: "Guantes" },
  { id: "e_boots", label: "Botas de hule" },
  { id: "e_coveralls", label: "Overol" },
  { id: "e_ladder", label: "Escalera" },
  { id: "e_respirator", label: "Respirador" },
  { id: "e_flashlight", label: "Linterna de mano" },
  { id: "e_rescue_harness", label: "Arnés para rescate" },
  { id: "e_lifeline", label: "Línea de vida" },
  { id: "e_tripod", label: "Trípie" },
  { id: "e_explosion_proof_tools", label: "Herramientas manuales a prueba de explosiones" },
  { id: "e_breathing", label: "Equipo de respiración autónoma (SCBA, línea de aire)" },
  { id: "e_ventilation", label: "Equipo de ventilación" },
] as const;

export const confinedChecklistIds: string[] = [
  ...confinedQuestions.map((item) => item.id),
  ...confinedEquipment.map((item) => item.id),
];

export function get_confined_check_field(id: string): string {
  return `check_${id}`;
}

/** Firmas que autorizan la entrada (las 4 obligatorias); HSEA firma al concluir. */
export const confinedApprovalSignatures = [
  { key: "requester", label: "Solicitante / responsable del trabajo" },
  { key: "operational_manager", label: "Responsable operativo / de área" },
  { key: "medical_service", label: "Servicio médico y/o brigadista" },
  { key: "lookout", label: "Prevencionista / vigía" },
] as const;

export const confinedClosingSignature = {
  key: "hsea",
  label: "Departamento HSEA",
} as const;

export type ConfinedEvaluation = "fit" | "unfit";

export const confinedEvaluationLabels: Record<ConfinedEvaluation, string> = {
  fit: "APTO",
  unfit: "NO APTO",
};

export function find_confined_signature(permit: WorkPermit, key: string) {
  return permit.signatures.find((signature) => signature.key === key);
}

export function get_confined_executors(permit: WorkPermit): string[] {
  const executors: string[] = [];
  for (let position = 1; position <= confinedMaxExecutors; position += 1) {
    const name = permit.fields[`executor${position}`];
    if (typeof name === "string" && name) executors.push(name);
  }
  return executors;
}

export function get_confined_selected(permit: WorkPermit, key: ConfinedRiskKey): string[] {
  const category = confinedRiskCategories.find((item) => item.key === key);
  const slugs = String(permit.fields[key] ?? "").split(",");
  return (category?.items ?? [])
    .filter((item) => slugs.includes(item.slug))
    .map((item) => item.label);
}

/** La vigencia de 8 horas corre desde la última firma de autorización. */
export function get_confined_valid_until(permit: WorkPermit): Date | null {
  const times = confinedApprovalSignatures.map(
    (item) => find_confined_signature(permit, item.key)?.signedAt,
  );
  if (times.some((time) => !time)) return null;
  const lastSignedAt = (times as string[]).sort().at(-1);
  if (!lastSignedAt) return null;
  return new Date(new Date(lastSignedAt).getTime() + confinedValidityHours * 60 * 60 * 1000);
}
