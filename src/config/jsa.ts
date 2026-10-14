import type { WorkTypeCode } from "@/config/documentos_contratista";
import type { WorkPermit } from "@/domain/permisos";

/** Estructura del formato FO-0066 (Análisis de seguridad en el trabajo, JSA). */
export const jsaSlug = "analisis-seguridad-jsa";
/** Pasos que trae el formato impreso; al llenarlos todos se pueden agregar más hasta `jsaMaxSteps`. */
export const jsaInitialSteps = 12;
export const jsaMaxSteps = 30;
export const jsaMaxParticipants = 6;

/** ¿Requiere permiso de trabajo? Si todas son NO, "no requiere permiso de trabajo". */
export const jsaPermitQuestions = [
  { field: "permitHeights", label: "Trabajos en altura" },
  { field: "permitConfined", label: "Trabajos en espacios confinados" },
  { field: "permitHot", label: "Trabajos en caliente" },
  { field: "permitHazardous", label: "Trabajos peligrosos (eléctrico, excavaciones y maniobras)" },
] as const;

/**
 * Trabajo específico (con DC-3) que exige cada respuesta SÍ; los contratistas que participen deben tener esa
 * certificación aprobada. "Trabajos peligrosos" no tiene un DC-3 propio en el catálogo.
 */
export const jsaPermitWorkTypes: Partial<Record<(typeof jsaPermitQuestions)[number]["field"], WorkTypeCode>> = {
  permitHeights: "ALTURAS",
  permitConfined: "CONFINADOS",
  permitHot: "CALIENTES",
};

export const jsaScale = [1, 2, 3, 4] as const;

/** Colores de los niveles 1 a 4 de probabilidad y severidad (verde, amarillo, naranja, rojo). */
export function get_level_class(value: number): string {
  if (value <= 1) return "bg-lime-400 text-brand-navy";
  if (value === 2) return "bg-yellow-300 text-brand-navy";
  if (value === 3) return "bg-orange-400 text-brand-navy";
  return "bg-red-600 text-white";
}

export const jsaProbabilityLevels = [
  { value: 1, label: "Control aceptable", description: "El peligro es controlado mediante controles de ingeniería." },
  { value: 2, label: "Control considerable", description: "El peligro es controlado mediante controles de ingeniería/humano-dependientes que impiden la interacción con el personal." },
  { value: 3, label: "Control mejorable", description: "El peligro es controlado mediante controles administrativos que instruyen al personal la forma segura." },
  { value: 4, label: "Control deficiente", description: "El peligro es controlado únicamente con el uso e implementación del EPP." },
];

export const jsaSeverityLevels = [
  { value: 1, label: "Ligeramente dañino", description: "Lesiones que solo requieren atención de primeros auxilios." },
  { value: 2, label: "Dañino", description: "Lesiones que requieren tratamiento médico." },
  { value: 3, label: "Altamente dañino", description: "Lesiones que generan actividades reducidas o restringidas o una incapacidad." },
  { value: 4, label: "Extremadamente dañino", description: "Lesiones que generan incapacidad permanente total o parcial." },
];

export function get_risk_level(risk: number): {
  label: string;
  description: string;
  className: string;
} {
  if (risk <= 4) {
    return {
      label: "Riesgo aceptable",
      description: "El trabajador puede continuar sus actividades.",
      className: "bg-lime-400 text-brand-navy",
    };
  }
  if (risk <= 8) {
    return {
      label: "Riesgo notable",
      description: "Se pueden implementar mejoras en los controles.",
      className: "bg-yellow-300 text-brand-navy",
    };
  }
  if (risk <= 12) {
    return {
      label: "Riesgo importante",
      description: "El trabajador puede continuar sus actividades; se deben implementar mejoras en los controles.",
      className: "bg-orange-400 text-brand-navy",
    };
  }
  return {
    label: "Riesgo inaceptable",
    description:
      "El trabajador no puede continuar sus actividades; se debe implementar un control inmediato y/o temporal y programar un control definitivo de prevención.",
    className: "bg-red-600 text-white",
  };
}

/** Catálogo de peligros y riesgos (reverso del formato); los ids son "peligro.riesgo". */
const hazardDefinitions: [string, string[]][] = [
  ["Condiciones de clima extremo", ["Exposición a temperaturas extremas"]],
  ["Diseño de estación de trabajo", ["Acceso deficiente o espacio inadecuado"]],
  ["Eléctrico", [
    "Contacto con electricidad directa o indirecta. Puede ser corriente alterna o directa.",
    "Quemaduras en piel por electricidad",
    "Sobrecarga a equipos o maquinaria de corriente eléctrica",
    "Generación de arco eléctrico",
  ]],
  ["Empujar y tirar", [
    "Perder el equilibrio al empujar o tirar una carga",
    "Empujar o tirar de un objeto (tolvas, carros de herramientas, etc.)",
  ]],
  ["Espacios confinados", [
    "Falta de oxígeno en espacio confinado.",
    "Inhalación de alguna sustancia tóxica en el espacio confinado.",
    "Incendios generados por las sustancias inflamables del espacio confinado.",
  ]],
  ["Estrés por calor", [
    "Insolación por estar expuesto al sol por varias horas.",
    "Agotamiento, mareos, desmayo por actividades físicas agotadoras en un ambiente caluroso, pueden ser internas o externas",
  ]],
  ["Explosión", [
    "Fugas de oxígeno, hidrógeno, CO o gases pueden conducir a una explosión.",
    "Combustible almacenado en tanques que al contacto con cualquier chispa genera explosión.",
  ]],
  ["Falla estructural", ["Caída de estructuras y/o equipos por mala instalación o por falta de mantenimiento"]],
  ["Fuego", [
    "Incendio en maquinaria, instalaciones y/o equipos.",
    "Quemaduras en personal por contacto con fuego.",
  ]],
  ["Grúas puente y otras tipologías de grúas", [
    "Caída de carga de una grúa (problemas de magnetización, rotura de la eslinga, o algún otro de sus componentes).",
    "Caída de componentes de una grúa.",
  ]],
  ["Iluminación inadecuada", [
    "Tropiezos, caídas, por falta de iluminación en el área de trabajo.",
    "Problemas oculares por forzar vista debido a iluminación inadecuada",
  ]],
  ["La manipulación de cargas bajas a alta frecuencia", [
    "Dolor y fatiga por manejo de cargas bajas a alta frecuencia (trabajo repetitivo).",
  ]],
  ["Láser", ["Cortes por láser", "Quemaduras en piel."]],
  ["Levantamiento y transporte", [
    "Lesiones al levantar o transportar cargas manualmente.",
    "Machucones y/o atrapamientos al levantar o trasladar objetos sin asistencia mecánica",
  ]],
  ["Maquinaria en movimiento", [
    "Atrapado por algún elemento rotativo o de desplazamiento de una maquinaria o equipo.",
  ]],
  ["Material en movimiento descontrolado (caída, rodamiento, proyectado)", [
    "Caída y/o rodamiento de piezas u objetos de maquinaria, equipos y/o equipos automotores en movimiento.",
  ]],
  ["Metal caliente", ["Quemaduras causadas por equipos y objetos calientes en contacto con la piel"]],
  ["Objetos peligrosos que pudieran generar lesión con partes filosas", [
    "Cortes con rebabas de tuberías, sierras de corte, herramientas, etc",
  ]],
  ["Objetos que caen", ["Herramienta y objetos que pudiera caer de un andamio, escaleras o alguna estructura"]],
  ["Peligros vecinales", [
    "Afectaciones por rutas de despegue/aterrizaje de aviones, centrales nucleares, almacenes de gas, industria química, ferrocarriles, barcos para el transporte de tubería, etc",
  ]],
  ["Proyección de elementos/materiales", [
    "Proyección de piezas debido a la rotura de un disco de pulidora.",
    "Proyección de rebabas u otros materiales",
  ]],
  ["Radiación ionizante", [
    "Estar expuesto a fuentes radiactivas cuando el obturador esté abierto o cuando esté fuera de su blindaje.",
  ]],
  ["Radiación no ionizante y radiación electromagnética", [
    "Radiaciones ultravioletas; equipos de soldadura, lámparas solares",
    "Radiación infrarroja; hornos de arco eléctrico, material candente, lámparas de infrarrojos.",
  ]],
  ["Resbalones, tropezones y caídas", [
    "Tropezar y/o golpearse con objetos sueltos en oficinas, pisos, escaleras, plataformas, etc",
    "Deslizamiento en superficies grasientas, mojadas, sucias, o agujeros.",
    "Golpearse con partes sobresalientes u objetos mal apilados/colocados.",
  ]],
  ["Ruido", ["Exposición a sonidos mayor a 85 decibeles con un tiempo de exposición mayor a 8 horas"]],
  ["Tareas y herramientas manuales", [
    "Machucones con herramientas manuales durante una actividad.",
    "Golpes o cortes ocasionados por la propia herramienta manual, eléctrica o neumática durante la actividad.",
  ]],
  ["Trabajos en alturas", [
    "Caídas de una plataforma, andamios, escaleras, techos y/o caer en una cavidad subterránea (mayor a 1.8 m).",
  ]],
  ["Trabajar solo", [
    "El trabajador puede estar expuesto a una situación de emergencia donde no puede ser auxiliado o supervisado",
  ]],
  ["Vehículos en planta (automóviles, camiones, remolques, otros vehículos)", [
    "Choques entre vehículos",
    "Atropellamiento a personal",
    "Volcadura de vehículos.",
  ]],
  ["Vehículos fuera de planta (automóviles, camiones, remolques, otros vehículos)", [
    "Colisión de vehículos fuera de las instalaciones",
    "Ser atropellado fuera de planta en el trayecto al trabajo",
  ]],
  ["Vibración cuerpo entero", [
    "Exposición a vibraciones fuera del rango permitido al operar grúas y equipos pesados (montacargas, retroexcavadoras).",
  ]],
  ["Vibración mano brazo", [
    "Exposición a vibraciones fuera de rango permitido al usar herramientas de potencias vibratorias (esmerilado, taladrado y martillos neumáticos, etc.).",
  ]],
  ["Video, monitor y pantalla", ["Brillo excesivo en monitores y/o pantallas que cause problemas oculares"]],
  ["Exposición a microorganismos", ["Picaduras de insectos y arácnidos (escorpiones, arañas, abejas, etc.)"]],
  ["Inhalación, ingestión, absorción de sustancias químicas", [
    "Inhalación de sustancias peligrosas tales como polvos, humos, nieblas, vapores o gases existan o estén produciéndose en el lugar de trabajo.",
  ]],
  ["Agentes psicosociales", [
    "Ataques verbales, palabras altisonantes, humillaciones, extorsión, amenazas, violencia y acoso",
  ]],
  ["Estrés relacionado con el trabajo", ["Una actividad laboral que demande un esfuerzo físico excesivo al trabajador"]],
  ["Factores sociales", ["No tener un balance de vida / trabajo."]],
];

export const jsaHazards = hazardDefinitions.map(([name, risks], index) => ({
  number: index + 1,
  name,
  risks: risks.map((text, riskIndex) => ({
    id: `${index + 1}.${riskIndex + 1}`,
    text,
  })),
}));

export const jsaRiskIds: string[] = jsaHazards.flatMap((hazard) =>
  hazard.risks.map((risk) => risk.id),
);

export const jsaChecklists = [
  { slug: "scissor_lift", label: "Plataforma elevada tipo tijera" },
  { slug: "scaffold", label: "Andamio" },
  { slug: "welding_machine", label: "Máquina de soldar eléctrica" },
  { slug: "oxyacetylene", label: "Equipos de oxi-acetileno" },
  { slug: "drill", label: "Taladro" },
  { slug: "grinder", label: "Pulidora eléctrica" },
  { slug: "floor_saw", label: "Cortadora de piso" },
  { slug: "hoist", label: "Polipasto" },
  { slug: "slings", label: "Eslingas" },
  { slug: "articulated_platform", label: "Plataforma articulada" },
  { slug: "compressor", label: "Compresor" },
  { slug: "ladder", label: "Escalera" },
  { slug: "concrete_breaker", label: "Rompedor de concreto" },
  { slug: "harness_lifeline", label: "Arnés y línea de vida" },
  { slug: "forklift", label: "Verificación de montacargas" },
] as const;

export const jsaEnvironmental = [
  { slug: "water", label: "Consumo de agua" },
  { slug: "waste", label: "Generación de residuos" },
  { slug: "electricity", label: "Consumo de electricidad" },
  { slug: "spills", label: "Derrames de sustancias químicas o residuos peligrosos" },
  { slug: "emissions", label: "Emisiones a la atmósfera" },
  { slug: "fuel", label: "Consumo de combustibles" },
  { slug: "raw_materials", label: "Materias primas" },
  { slug: "noise", label: "Ruido perimetral" },
] as const;

/** Aprobaciones obligatorias (personas distintas). */
export const jsaApprovalSignatures = [
  {
    key: "executor",
    label: "Responsable del trabajo",
    help: "Persona que dirige, coordina y responde por la ejecución segura del trabajo.",
  },
  {
    key: "operational_manager",
    label: "Responsable del área",
    help: "Persona que tiene a su cargo el lugar donde se realiza el trabajo.",
  },
  { key: "hsea", label: "HSE", help: "" },
] as const;

export function get_participant_key(position: number): string {
  return `participant_${position}`;
}

export function get_jsa_participants(permit: WorkPermit) {
  const participants: { position: number; name: string; job: string; company: string }[] = [];
  for (let position = 1; position <= jsaMaxParticipants; position += 1) {
    const name = permit.fields[`participant${position}Name`];
    if (typeof name === "string" && name) {
      participants.push({
        position,
        name,
        job: String(permit.fields[`participant${position}Job`] ?? ""),
        company: String(permit.fields[`participant${position}Company`] ?? ""),
      });
    }
  }
  return participants;
}

export function get_jsa_steps(permit: WorkPermit) {
  const steps: {
    number: number;
    description: string;
    hazards: string;
    controls: string;
    probability: number;
    severity: number;
    risk: number;
  }[] = [];
  const count = Number(permit.fields.stepCount ?? 0);
  for (let number = 1; number <= count; number += 1) {
    steps.push({
      number,
      description: String(permit.fields[`step${number}Description`] ?? ""),
      hazards: String(permit.fields[`step${number}Hazards`] ?? ""),
      controls: String(permit.fields[`step${number}Controls`] ?? ""),
      probability: Number(permit.fields[`step${number}P`]),
      severity: Number(permit.fields[`step${number}S`]),
      risk: Number(permit.fields[`step${number}R`]),
    });
  }
  return steps;
}

export function get_jsa_selected_risk_ids(permit: WorkPermit): string[] {
  return String(permit.fields.risks ?? "").split(",").filter(Boolean);
}
