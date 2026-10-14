import { notFound } from "next/navigation";
import { DetailCard } from "@/components/permisos/DetailCard";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitDetailHeader } from "@/components/permisos/PermitDetailHeader";
import { SectionCard } from "@/components/permisos/SectionCard";
import { SignatureBox, format_date_time } from "@/components/permisos/SignatureBox";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  get_phone_valid_until,
  phoneSignatures,
  phoneSlug,
} from "@/config/ingreso_celular";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { signErrorMessages } from "@/lib/permisos/mensajes_firma";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import { sign_phone_permit } from "@/lib/permisos/ingreso_celular_acciones";

interface PhoneDetailPageProps {
  params: Promise<{ permitId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  ...signErrorMessages,
  same_person: "Una misma persona no puede firmar dos roles del oficio.",
  signature: "La firma no es válida; dibújala de nuevo.",
};

export default async function PhonePermitDetailPage({
  params,
  searchParams,
}: PhoneDetailPageProps) {
  const { permitId } = await params;
  const { error } = await searchParams;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== phoneSlug || !can_access_permit(await require_permit_actor(), permit)) notFound();

  const events = await repositories.audit.list_events_by_entity("permisos_trabajo", permit.id);
  const validUntil = get_phone_valid_until(permit);
  const isExpired = validUntil !== null && validUntil.getTime() < Date.now();
  const canSign = permit.status === "submitted";
  const permitType = find_permit_type(phoneSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Ingreso con teléfono celular", href: `/permisos-trabajo/${phoneSlug}` },
          { label: String(permit.fields.folio) },
        ]}
      />
      <PermitDetailHeader
        folio={String(permit.fields.folio)}
        typeName={permitType?.name ?? "Ingreso con teléfono celular"}
        formCode={permitType?.formCode}
        status={permit.status}
      >
        {error && errorMessages[error] && <FormAlert>{errorMessages[error]}</FormAlert>}
        {validUntil && (
          <p
            className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${
              isExpired ? "border-red-300 bg-red-50 text-red-900" : "border-brand-green bg-green-50 text-green-900"
            }`}
          >
            {isExpired ? "✕ Autorización vencida el" : "✓ Vigente hasta el"} {format_date_time(validUntil.toISOString())}
          </p>
        )}
      </PermitDetailHeader>

      <p className="mb-6 rounded-xl border border-neutral-light bg-white p-5 text-sm shadow-sm">
        Se hace de su conocimiento que el C.{" "}
        <strong>{String(permit.fields.contractorName)}</strong> de la compañía{" "}
        <strong>{String(permit.fields.company)}</strong> queda autorizado para
        ingresar a la instalación TFS portando teléfono celular, exclusivamente con
        fines laborales y de comunicación operativa.
      </p>

      <DetailCard
        items={[
          { label: "Fecha", value: String(permit.fields.date) },
          { label: "Registrado por", value: permit.requestedByEmployeeNumber },
          { label: "Marca", value: String(permit.fields.phoneBrand) },
          { label: "Modelo", value: String(permit.fields.phoneModel) },
        ]}
      />

      <div className="mb-6">
        <SectionCard title="Firmas">
          <div className="grid gap-3 sm:grid-cols-3">
            {phoneSignatures.map((item) => (
              <SignatureBox
                key={item.key}
                action={sign_phone_permit}
                permit={permit}
                signatureKey={item.key}
                label={item.label}
                canSign={canSign}
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Historial">
        <ol className="space-y-2 border-l-2 border-neutral-light pl-4 text-sm">
          {events.map((event) => (
            <li key={event.id}>
              <span className="font-bold">{String(event.details.event ?? event.action)}</span>
              {event.details.key ? ` (${String(event.details.key)})` : ""}
              <span className="block text-xs text-neutral-dark">
                {format_date_time(event.occurredAt)} · {event.actorId}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}
