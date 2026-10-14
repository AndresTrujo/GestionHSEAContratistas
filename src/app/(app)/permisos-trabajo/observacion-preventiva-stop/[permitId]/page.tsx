import { notFound } from "next/navigation";
import { DetailCard } from "@/components/permisos/DetailCard";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitDetailHeader } from "@/components/permisos/PermitDetailHeader";
import { SectionCard } from "@/components/permisos/SectionCard";
import { SignatureBox, format_date_time } from "@/components/permisos/SignatureBox";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  damageClasses,
  get_stop_selected,
  stopCategories,
  stopSignatures,
  stopSlug,
} from "@/config/observacion_stop";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { signErrorMessages } from "@/lib/permisos/mensajes_firma";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import { sign_stop_observation } from "@/lib/permisos/observacion_stop_acciones";

interface StopDetailPageProps {
  params: Promise<{ permitId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  ...signErrorMessages,
  same_person:
    "El observado no puede ser el observador ni el supervisor, y una misma persona no firma dos veces.",
  signature: "La firma no es válida; dibújala de nuevo.",
  not_assigned: "Este paso solo lo puede firmar la persona elegida al crear la observación.",
};

export default async function StopObservationDetailPage({
  params,
  searchParams,
}: StopDetailPageProps) {
  const { permitId } = await params;
  const { error } = await searchParams;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== stopSlug || !can_access_permit(await require_permit_actor(), permit)) notFound();

  const events = await repositories.audit.list_events_by_entity("permisos_trabajo", permit.id);
  const damage = damageClasses.find((item) => item.value === permit.fields.damageClass);
  const canSign = permit.status === "submitted";
  const permitType = find_permit_type(stopSlug);
  const selectedCategories = stopCategories
    .map((category) => ({ category, selected: get_stop_selected(permit, category.key) }))
    .filter((entry) => entry.selected.length > 0);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Observación preventiva STOP", href: `/permisos-trabajo/${stopSlug}` },
          { label: String(permit.fields.folio) },
        ]}
      />
      <PermitDetailHeader
        folio={String(permit.fields.folio)}
        typeName={permitType?.name ?? "Observación preventiva STOP"}
        formCode={permitType?.formCode}
        status={permit.status}
      >
        {damage && (
          <p className="mb-5">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${damage.className}`}>
              Clase {damage.value} · {damage.level}
            </span>
          </p>
        )}
        {error && errorMessages[error] && <FormAlert>{errorMessages[error]}</FormAlert>}
      </PermitDetailHeader>

      <DetailCard
        items={[
          {
            label: "Observador",
            value: (
              <>
                {String(permit.fields.observerName)}{" "}
                <span className="text-sm text-neutral-dark">(registrado por {permit.requestedByEmployeeNumber})</span>
              </>
            ),
          },
          ...(permit.fields.observedName ? [{ label: "Observado", value: String(permit.fields.observedName) }] : []),
          ...(permit.fields.supervisorName ? [{ label: "Supervisor", value: String(permit.fields.supervisorName) }] : []),
          { label: "Fecha", value: String(permit.fields.date) },
          { label: "Ubicación del acto / condición", value: String(permit.fields.location) },
          { label: "Compañía", value: String(permit.fields.company) },
        ]}
      />

      {selectedCategories.length > 0 && (
        <div className="mb-6">
          <SectionCard title="Actos, condiciones y aspectos observados">
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedCategories.map(({ category, selected }) => (
                <div key={category.key}>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-dark">{category.title}</h3>
                  <ul className="list-inside list-disc text-sm">
                    {selected.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      <DetailCard
        items={[
          {
            label: "Descripción del acto / condición insegura",
            value: <span className="whitespace-pre-wrap">{String(permit.fields.description)}</span>,
            wide: true,
          },
          {
            label: "Acciones, recomendaciones o compromisos",
            value: <span className="whitespace-pre-wrap">{String(permit.fields.actions)}</span>,
            wide: true,
          },
        ]}
      />

      <div className="mb-6">
        <SectionCard title="Firmas">
          <div className="grid gap-3 sm:grid-cols-2">
            {stopSignatures.map((item) => (
              <SignatureBox
                key={item.key}
                action={sign_stop_observation}
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
