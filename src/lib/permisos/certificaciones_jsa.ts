import { documentTypes, type WorkTypeCode } from "@/config/documentos_contratista";
import { jsaMaxParticipants, jsaPermitQuestions, jsaPermitWorkTypes } from "@/config/jsa";
import type { RequirementStatus } from "@/domain/contratistas";
import { get_repositories } from "@/lib/data/proveedor_datos";
import type { PermitActor } from "./actor";

/** Un colaborador de contratista al que le falta alguna certificación que exige el trabajo del JSA. */
export interface CertificationIssue {
  name: string;
  missing: string[];
}

const statusText: Record<RequirementStatus, string> = {
  FALTANTE: "no se ha cargado",
  EN_REVISION: "en revisión",
  APROBADO: "aprobado",
  RECHAZADO: "rechazado",
  REVOCADO: "aprobación revocada",
  VENCIDO: "vencido",
};

/**
 * Si el JSA marca que el trabajo requiere permiso (alturas, espacios confinados o caliente), revisa el perfil de
 * cada colaborador de contratista elegido como participante: debe tener declarado ese trabajo y su DC-3 aprobado y
 * vigente. Devuelve a quienes no cumplen (lista vacía = todo en orden). Sin contratista o sin permisos, no hay nada que validar.
 */
export async function find_jsa_certification_issues(formData: FormData, actor: PermitActor): Promise<CertificationIssue[]> {
  const required: WorkTypeCode[] = [];
  for (const question of jsaPermitQuestions) {
    const workType = jsaPermitWorkTypes[question.field];
    if (formData.get(question.field) === "yes" && workType && !required.includes(workType)) required.push(workType);
  }
  if (required.length === 0) return [];

  const rawProvider = actor.providerId ?? String(formData.get("providerId") ?? "").trim();
  const providerId = Number(rawProvider);
  if (!rawProvider || !Number.isSafeInteger(providerId)) return [];

  const { providerEmployees } = get_repositories();
  const staff = await providerEmployees.list_employees(providerId);
  const issues: CertificationIssue[] = [];
  const checked = new Set<number>();

  for (let position = 1; position <= jsaMaxParticipants; position += 1) {
    const raw = String(formData.get(`participantStaff${position}`) ?? "").trim();
    const member = raw ? staff.find((candidate) => String(candidate.id) === raw) : undefined;
    if (!member || checked.has(member.id)) continue;
    checked.add(member.id);

    const requirements = (await providerEmployees.get_semaphore(member.id))?.requirements ?? [];
    const missing: string[] = [];
    for (const workType of required) {
      const type = documentTypes.find((item) => item.workTypeCode === workType);
      if (!type) continue;
      const requirement = requirements.find((item) => item.documentTypeCode === type.code);
      if (requirement?.status === "APROBADO") continue;
      missing.push(`${type.label}: ${requirement ? statusText[requirement.status] : "el trabajo no está declarado en su perfil"}`);
    }
    if (missing.length > 0) {
      issues.push({
        name: [member.firstName, member.middleName, member.paternalSurname, member.maternalSurname].filter(Boolean).join(" "),
        missing,
      });
    }
  }
  return issues;
}
