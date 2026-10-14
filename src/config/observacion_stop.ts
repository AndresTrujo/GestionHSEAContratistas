import type { WorkPermit } from "@/domain/permisos";

/** Estructura del formato FO-0059 (Seguridad en el trabajo por la observación preventiva, STOP). */
export const stopSlug = "observacion-preventiva-stop";

export type StopCategoryKey = "acts" | "conditions" | "environmental";

interface StopCategory {
  key: StopCategoryKey;
  title: string;
  items: { slug: string; label: string }[];
}

/** Cada categoría admite además un texto libre "Otro". */
export const stopCategories: StopCategory[] = [
  {
    key: "acts",
    title: "Actos inseguros",
    items: [
      { slug: "procedures", label: "Incumplimiento de procedimientos y/o reglas" },
      { slug: "unsafe_equipment", label: "Operar equipos de forma insegura" },
      { slug: "no_ppe", label: "No uso de EPP" },
      { slug: "lifting_interference", label: "Interferir en maniobras de equipos y/o grúas" },
      { slug: "unsafe_tools", label: "Uso inseguro de herramientas" },
      { slug: "horseplay", label: "Juegos, bromas o intimidación" },
      { slug: "electronics", label: "Uso de dispositivos electrónicos" },
    ],
  },
  {
    key: "conditions",
    title: "Condiciones inseguras",
    items: [
      { slug: "obstacles", label: "Obstáculos, huecos, obstrucciones" },
      { slug: "bad_tools", label: "Herramientas en mal estado" },
      { slug: "electrical", label: "Instalaciones eléctricas inseguras" },
      { slug: "vehicles", label: "Vehículos o maquinaria pesada" },
      { slug: "safety_signs", label: "Señalamientos de seguridad" },
      { slug: "pedestrian_routes", label: "Rutas peatonales" },
    ],
  },
  {
    key: "environmental",
    title: "Aspectos ambientales",
    items: [
      { slug: "spills", label: "Derrames / fugas" },
      { slug: "unlabeled_chemicals", label: "Sustancias químicas sin señalizar" },
      { slug: "no_containment", label: "Falta de dispositivo de contención" },
      { slug: "energized_idle", label: "Equipos energizados sin uso" },
      { slug: "combustion_equipment", label: "Equipos de combustión en mal estado" },
    ],
  },
];

export type DamageClass = "A" | "B" | "C";

export const damageClasses: {
  value: DamageClass;
  level: string;
  description: string;
  className: string;
}[] = [
  {
    value: "A",
    level: "Alta",
    description:
      "Podría ocasionar la muerte, una incapacidad permanente o pérdida de alguna parte del cuerpo, daños de considerable valor. Fuga y/o derrames de sustancias químicas peligrosas con afectación directa a los vertimientos.",
    className: "bg-red-600 text-white",
  },
  {
    value: "B",
    level: "Medio",
    description:
      "Podría ocasionar una lesión o enfermedad grave, con una incapacidad temporal, o daño a la propiedad menor al de la Clase A. Fugas y/o derrames de sustancias químicas con afectación directa (no se genera impacto sobre vertimientos).",
    className: "bg-yellow-300 text-brand-navy",
  },
  {
    value: "C",
    level: "Bajo",
    description:
      "Podría ocasionar lesiones menores. Sin incapacidad, enfermedad leve o daños menores. Comportamiento \"NO\" seguro con el medio ambiente.",
    className: "bg-lime-400 text-brand-navy",
  },
];

/** Firmas del registro (personas distintas entre sí y distintas del observador). */
export const stopSignatures = [
  { key: "observed", label: "Observado" },
  { key: "supervisor", label: "Supervisor" },
] as const;

export function get_stop_selected(permit: WorkPermit, key: StopCategoryKey): string[] {
  const slugs = String(permit.fields[key] ?? "").split(",");
  const category = stopCategories.find((item) => item.key === key);
  const labels = (category?.items ?? [])
    .filter((item) => slugs.includes(item.slug))
    .map((item) => item.label);
  const other = permit.fields[`${key}Other`];
  if (typeof other === "string" && other) labels.push(`Otro: ${other}`);
  return labels;
}
