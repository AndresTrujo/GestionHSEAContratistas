import type { WorkPermit } from "@/domain/permisos";

/** Estructura del formato FO-0060 (Permiso para trabajos en alturas). */
export const heightsSlug = "trabajos-en-alturas";
export const heightsMaxExecutors = 6;
export const heightsVerificationCount = 4;
export const heightsMaxExtensionHours = 4;
export const heightsRevalidationHour = 18;

export type MedicalEvaluation = "fit" | "unfit";

export const medicalEvaluationLabels: Record<MedicalEvaluation, string> = {
  fit: "APTO",
  unfit: "NO APTO",
};

/** A diferencia del FO-0131, la lista del FO-0060 solo admite SI / NO. */
export type HeightsAnswer = "yes" | "no";

export const heightsAnswerLabels: Record<HeightsAnswer, string> = {
  yes: "SI",
  no: "NO",
};

export const heightsPpeOptions = [
  { slug: "helmet", label: "Casco" },
  { slug: "glasses", label: "Lentes" },
  { slug: "gloves", label: "Guantes" },
  { slug: "shoes", label: "Zapatos anti-derrapantes" },
] as const;

interface HeightsChecklistGroup {
  title: string;
  items: {
    /** Número en el formato; las sub-preguntas usan sufijo (5a, 5b…). */
    id: string;
    text: string;
  }[];
}

/** Lista de verificación (reverso del FO-0060); todas las preguntas son obligatorias. */
export const heightsChecklist: HeightsChecklistGroup[] = [
  {
    title: "Requerimientos generales",
    items: [
      { id: "1", text: "Equipos de protección contra caídas aprobado, sin desviaciones y con inspección de pre-uso: arnés de seguridad y cable de seguridad o línea retráctil, líneas de vida" },
      { id: "2", text: "Otros equipos de protección personal requeridos" },
      { id: "3", text: "Los equipos/escaleras bloquean puertas, pasillos o equipo contra incendio" },
      { id: "4", text: "Señalamientos y acordonamiento completo en el área de trabajo y niveles inferiores" },
      { id: "5", text: "Herramientas y equipo en buen estado, sin desviaciones y con inspección de pre-uso" },
      { id: "5a", text: "Escaleras portátiles (extensión, tijera, rectas)" },
      { id: "5b", text: "Plataformas de elevación de personal" },
      { id: "5c", text: "Andamios multidireccionales" },
      { id: "6", text: "Herramienta asegurada en porta-herramientas y amarrada para su ascenso y descenso" },
      { id: "7", text: "Los ejecutantes están capacitados para realizar trabajos en altura" },
    ],
  },
  {
    title: "Escaleras portátiles y andamios",
    items: [
      { id: "8", text: "La estructura de las escaleras a utilizar es de fibra de vidrio (trabajos eléctricos)" },
      { id: "9", text: "Escaleras colocadas en superficies estables y con inclinación segura" },
      { id: "10", text: "Escaleras sujetas en ambos extremos" },
      { id: "11", text: "Andamios firmes, colocados en superficies estables y asegurados" },
      { id: "12", text: "Rodapié" },
      { id: "13", text: "Andamios móviles con dispositivo de freno accionado en cada rueda" },
      { id: "14", text: "Andamio cuenta con estabilizadores" },
      { id: "15", text: "Andamios con protecciones circundantes en el último nivel" },
    ],
  },
  {
    title: "Plataformas de elevación (el uso de canastillas para elevación de personal está prohibido)",
    items: [
      { id: "16", text: "Operador certificado y capacitado" },
      { id: "17", text: "Existe espacio suficiente para evitar contacto con peligros aéreos" },
      { id: "18", text: "Plataformas colocadas en superficies estables y sin riesgos de volcadura" },
    ],
  },
  {
    title: "Trabajos sobre techos",
    items: [
      { id: "19", text: "Piso de la techumbre firme y resistente para soportar el peso del personal" },
      { id: "20", text: "Línea de vida instalada en la zona donde se realizará el trabajo" },
      { id: "21", text: "Niveles inferiores protegidos, acordonados y señalizados" },
      { id: "22", text: "Se han identificado domos, superficies frágiles o aberturas en la techumbre y considerado protecciones para evitar riesgo de caída" },
    ],
  },
  {
    title: "Trabajos sobre maquinaria o equipos",
    items: [
      { id: "23", text: "Se ha puesto la maquinaria fuera de operación y aplicado el procedimiento LOTO" },
      { id: "24", text: "Equipos protegidos y herramientas aseguradas para evitar daño por caída de objeto" },
      { id: "25", text: "Inventario de herramientas realizado y verificado al inicio y conclusión del trabajo" },
    ],
  },
];

export const heightsChecklistItems = heightsChecklist.flatMap((group) => group.items);

export function get_heights_checklist_field(id: string): string {
  return `check${id}`;
}

export function get_ppe_labels(permit: WorkPermit): string[] {
  const selected = String(permit.fields.ppe ?? "").split(",");
  const labels: string[] = heightsPpeOptions
    .filter((option) => selected.includes(option.slug))
    .map((option) => option.label);
  const other = permit.fields.ppeOther;
  if (typeof other === "string" && other) labels.push(other);
  return labels;
}

/** Firmas que autorizan el permiso (las 4 obligatorias, personas distintas). */
export const heightsApprovalSignatures = [
  { key: "executor", label: "Responsable de la ejecución" },
  { key: "medical_service", label: "Servicio médico" },
  { key: "operational_manager", label: "Responsable operativo del área" },
  { key: "hsea", label: "HSEA" },
] as const;

export function get_heights_verification_key(position: number): string {
  return `verification_${position}`;
}

export function get_heights_executors(permit: WorkPermit): string[] {
  const executors: string[] = [];
  for (let position = 1; position <= heightsMaxExecutors; position += 1) {
    const name = permit.fields[`executor${position}`];
    if (typeof name === "string" && name) executors.push(name);
  }
  return executors;
}

export function find_heights_signature(permit: WorkPermit, key: string) {
  return permit.signatures.find((signature) => signature.key === key);
}

export function get_local_date(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

/** El permiso es válido solo en la fecha solicitada. */
export function is_valid_today(permit: WorkPermit): boolean {
  return permit.fields.date === get_local_date(new Date());
}

/** Pasadas las 6:00 p.m. se requiere revalidación del responsable operativo. */
export function needs_revalidation(permit: WorkPermit, now: Date): boolean {
  return (
    is_valid_today(permit) &&
    now.getHours() >= heightsRevalidationHour &&
    !find_heights_signature(permit, "extension")
  );
}
