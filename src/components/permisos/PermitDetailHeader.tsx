import type { ReactNode } from "react";
import { PermitStatusBadge } from "@/components/permisos/PermitStatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import type { PermitStatus } from "@/domain/permisos";

interface PermitDetailHeaderProps {
  folio: string;
  typeName: string;
  formCode?: string;
  status: PermitStatus;
  /** Avisos bajo el título (vigencia, errores…). */
  children?: ReactNode;
}

/** Encabezado del detalle de un permiso: folio, tipo y formato, estado y, debajo, avisos como la vigencia. */
export function PermitDetailHeader({ folio, typeName, formCode, status, children }: PermitDetailHeaderProps) {
  return (
    <>
      <PageHeader
        title={`Folio ${folio}`}
        subtitle={typeName}
        eyebrow={
          <>
            {formCode && (
              <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{formCode}</span>
            )}
            <PermitStatusBadge status={status} />
          </>
        }
      />
      {children}
    </>
  );
}
