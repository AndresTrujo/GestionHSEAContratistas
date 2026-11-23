import { update_executor_medical_evaluation, remove_executor_from_permit } from "@/lib/permisos/participantes_ejecutantes_acciones";

interface ExecutorRowActionsProps {
  permitId: string;
  position: number;
  evaluation?: string;
  canEdit: boolean;
  showMedicalEvaluation?: boolean;
}

const choices = [
  { value: "fit", label: "Apto" },
  { value: "unfit", label: "No apto" },
  { value: "absent", label: "No asistió" },
] as const;

export function ExecutorRowActions({ permitId, position, evaluation, canEdit, showMedicalEvaluation = true }: ExecutorRowActionsProps) {
  if (!canEdit) return <span className="text-sm text-neutral-dark">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {showMedicalEvaluation && choices.map((choice) => (
        <form key={choice.value} action={update_executor_medical_evaluation}>
          <input type="hidden" name="permitId" value={permitId} />
          <input type="hidden" name="position" value={position} />
          <input type="hidden" name="evaluation" value={choice.value} />
          <button type="submit" aria-pressed={evaluation === choice.value} className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-bold ${evaluation === choice.value ? "border-brand-navy bg-brand-navy text-white" : "border-neutral-light hover:bg-neutral-light/40"}`}>
            {choice.label}
          </button>
        </form>
      ))}
      <form action={remove_executor_from_permit}>
        <input type="hidden" name="permitId" value={permitId} />
        <input type="hidden" name="position" value={position} />
        <button type="submit" className="min-h-9 rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-50">
          Eliminar
        </button>
      </form>
    </div>
  );
}
