import type { WorkPermit } from "@/domain/permisos";

/** Estructura del formato FO-0131 (Permiso para trabajos calientes). */
export const hotWorkSlug = "trabajos-calientes";
export const hotWorkValidityHours = 12;
export const hotWorkMaxExecutors = 5;
export const hotWorkVerificationCount = 4;

export const hotWorkActivities = [
  { slug: "welding", label: "Soldadura" },
  { slug: "cutting", label: "Corte" },
  { slug: "sparks", label: "Generar chispas" },
  { slug: "flame", label: "Generar flama" },
  { slug: "oxycutting", label: "Oxicorte" },
  { slug: "drilling", label: "Barrenado" },
  { slug: "grinding", label: "Esmerilado" },
] as const;

export type ChecklistAnswer = "yes" | "no" | "na";

export const checklistAnswerLabels: Record<ChecklistAnswer, string> = {
  yes: "SI",
  no: "NO",
  na: "N/A",
};

interface ChecklistGroup {
  title: string | null;
  items: { number: number; text: string }[];
}

/** Lista de verificación (reverso del FO-0131); todas las preguntas son obligatorias. */
export const hotWorkChecklist: ChecklistGroup[] = [
  {
    title: "Requerimientos de oxi-acetileno",
    items: [
      { number: 1, text: "Cilindros de oxi-acetileno asegurados y transportados correctamente" },
      { number: 2, text: "Manómetros, mangueras, boquillas, mezclador en buen estado" },
      { number: 3, text: "Prueba de fugas a mangueras y conexiones de oxi-acetileno" },
      { number: 4, text: "Cuenta con arresta-flamas y válvulas check en entrada y salida de cada línea" },
    ],
  },
  {
    title: "Máquinas de soldar",
    items: [
      { number: 5, text: "Cables y porta-electrodos en buen estado, sin empalmes" },
      { number: 6, text: "Máquina de soldar con conexión a tierra" },
      { number: 7, text: "Extensiones eléctricas en buen estado, sin empalmes" },
      { number: 8, text: "Inspección de pre-uso para máquina de soldar y otros equipos" },
    ],
  },
  {
    title: "Condiciones generales",
    items: [
      { number: 9, text: "Los equipos de corte y soldadura se encuentran obstruyendo pasillos" },
      { number: 10, text: "Se satisface el permiso de Espacios Confinados" },
      { number: 11, text: "Se satisface el procedimiento de LOTO" },
      { number: 12, text: "Se satisface el permiso de Trabajos en Alturas" },
      { number: 13, text: "Se satisface el permiso de Trabajos Peligrosos" },
      { number: 14, text: "Se verificó la ausencia de atmósferas peligrosas (nubes de polvo, acumulación de vapores de solventes en el área de trabajo y áreas circundantes)" },
      { number: 15, text: "Se ha monitoreado el nivel de explosividad en un perímetro de 10 metros alrededor de tuberías de gas" },
      { number: 16, text: "Se ha ventilado el interior de los tanques para evitar atmósferas explosivas" },
    ],
  },
  {
    title: "Medidas de seguridad",
    items: [
      { number: 17, text: "Ejecutante calificado en condiciones físicas apropiadas" },
      { number: 18, text: "El EPP está completo y en buen estado" },
      { number: 19, text: "El explosímetro indica niveles seguros" },
      { number: 20, text: "Colocación de señalamientos y acordonamiento del área" },
      { number: 21, text: "Notificación al personal del área" },
      { number: 22, text: "Suspensión de operaciones del área mientras se realiza el trabajo" },
      { number: 23, text: "Colocación de 1 extintor al alcance para uso en caso de emergencia" },
      { number: 24, text: "Se han retirado los materiales combustibles e inflamables a más de 6 m" },
      { number: 25, text: "Mantener mojado el piso, tuberías o equipos bajo el trabajo caliente" },
      { number: 26, text: "Cubrir con una lona ignífuga el área de trabajo y equipos adyacentes" },
      { number: 27, text: "Colocar extractor/ventilador para desalojar humos en espacios cerrados" },
      { number: 28, text: "Se ha realizado la limpieza del área (paredes y techos) y se han taponeado hendiduras, rendijas, drenajes, agujeros por donde pudieron introducirse chispas" },
      { number: 29, text: "Verificó que las chispas no se extiendan y caigan sobre el material combustible" },
      { number: 30, text: "Verificó que las chispas no caigan hacia niveles inferiores" },
      { number: 31, text: "Verificó la ausencia de acumulaciones de polvo al realizar actividades de barrenado y esmerilado" },
      { number: 32, text: "Se aseguró de no utilizar contenedores o latas vacías como bancos de trabajo" },
      { number: 33, text: "Se soldará en un lugar poco ventilado" },
    ],
  },
];

export const hotWorkChecklistItems = hotWorkChecklist.flatMap((group) => group.items);

export function get_checklist_field(number: number): string {
  return `check${number}`;
}

/** Firmas que autorizan el permiso (las 4 obligatorias, personas distintas). */
export const hotWorkApprovalSignatures = [
  { key: "executor", label: "Responsable de la ejecución" },
  { key: "tfs_executor", label: "Responsable de la ejecución por parte de TFS" },
  { key: "operational_manager", label: "Responsable operativo del área" },
  { key: "hsea", label: "HSEA" },
] as const;

export function get_verification_key(position: number): string {
  return `verification_${position}`;
}

export function get_executors(permit: WorkPermit): string[] {
  const executors: string[] = [];
  for (let position = 1; position <= hotWorkMaxExecutors; position += 1) {
    const name = permit.fields[`executor${position}`];
    if (typeof name === "string" && name) executors.push(name);
  }
  return executors;
}

export function get_activity_labels(permit: WorkPermit): string[] {
  const selected = String(permit.fields.activities ?? "").split(",");
  return hotWorkActivities
    .filter((activity) => selected.includes(activity.slug))
    .map((activity) => activity.label);
}

export function find_signature(permit: WorkPermit, key: string) {
  return permit.signatures.find((signature) => signature.key === key);
}

/** Momento en que se completó la última firma de autorización (inicio de vigencia). */
export function get_valid_from(permit: WorkPermit): string | null {
  const times = hotWorkApprovalSignatures.map(
    (item) => find_signature(permit, item.key)?.signedAt,
  );
  if (times.some((time) => !time)) return null;
  return (times as string[]).sort().at(-1) ?? null;
}

export function get_valid_until(permit: WorkPermit): Date | null {
  const validFrom = get_valid_from(permit);
  if (!validFrom) return null;
  return new Date(
    new Date(validFrom).getTime() + hotWorkValidityHours * 60 * 60 * 1000,
  );
}
