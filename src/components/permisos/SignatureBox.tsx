import type { ReactNode } from "react";
import { SignatureModal } from "@/components/permisos/SignatureModal";
import type { WorkPermit } from "@/domain/permisos";

export function format_date_time(iso: string): string {
  return new Date(iso).toLocaleString("es-MX");
}

interface SignatureBoxProps {
  permit: WorkPermit;
  signatureKey: string;
  label: string;
  /** Texto de apoyo que se muestra dentro del recuadro, debajo del título. */
  description?: string;
  canSign: boolean;
  action: (formData: FormData) => Promise<void>;
  buttonLabel?: string;
  /** Campos extra que se piden dentro del modal al firmar. */
  modalFields?: ReactNode;
}

/** Recuadro de firma: muestra la firma registrada o el botón que abre el modal. El estado va en texto y símbolo, no solo en color. */
export function SignatureBox({
  permit,
  signatureKey,
  label,
  description,
  canSign,
  action,
  buttonLabel,
  modalFields,
}: SignatureBoxProps) {
  const signature = permit.signatures.find((item) => item.key === signatureKey);
  const tone = signature
    ? "border-brand-green bg-green-50/50"
    : canSign
      ? "border-brand-cyan bg-cyan-50/50"
      : "border-dashed border-neutral-dark/50 bg-white";

  return (
    <div className={`flex h-full flex-col rounded-xl border-2 p-3 text-sm ${tone}`}>
      <p className={`flex items-center justify-between gap-2 font-bold ${description ? "mb-1" : "mb-2"}`}>
        <span>{label}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${
            signature
              ? "bg-green-50 text-green-900 ring-brand-green"
              : canSign
                ? "bg-cyan-50 text-brand-navy ring-brand-cyan"
                : "bg-neutral-light/30 text-neutral-dark ring-neutral-dark/40"
          }`}
        >
          {signature ? "✓ Firmado" : canSign ? "Por firmar" : "Pendiente"}
        </span>
      </p>
      {description && <p className="mb-2 text-xs text-neutral-dark">{description}</p>}
      {signature ? (
        <div>
          {signature.image && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, no optimización
            <img
              src={signature.image}
              alt={`Firma de ${signature.employeeNumber}`}
              className="mb-2 h-16 w-full rounded-lg border border-neutral-light bg-white object-contain"
            />
          )}
          <p className="text-brand-navy">Firmado por {signature.employeeNumber}</p>
          <p className="text-xs text-neutral-dark">{format_date_time(signature.signedAt)}</p>
        </div>
      ) : canSign ? (
        <SignatureModal
          action={action}
          permitId={permit.id}
          signatureKey={signatureKey}
          label={label}
          buttonLabel={buttonLabel}
        >
          {modalFields}
        </SignatureModal>
      ) : (
        <p className="text-neutral-dark">Aún no se puede firmar.</p>
      )}
    </div>
  );
}
