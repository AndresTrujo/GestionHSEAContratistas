import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cardClass } from "@/components/administracion/estilos";
import { SemaphoreBadge } from "@/components/contratistas/SemaphoreBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { create_access_token } from "@/lib/acceso/token_acceso";
import { can_manage_provider, require_provider_access } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface AccessPageProps {
  params: Promise<{ providerId: string; employeeId: string }>;
}

/**
 * Pantalla de acceso a planta del colaborador: nombre, puesto, compañía, fotografía y QR para la caseta.
 * Solo se genera con semáforo VERDE y fotografía vigente; el QR se vuelve a validar en vivo al escanearlo.
 */
export default async function EmployeeAccessPage({ params }: AccessPageProps) {
  const { providerId: rawProviderId, employeeId: rawEmployeeId } = await params;
  const providerId = Number(rawProviderId);
  const employeeId = Number(rawEmployeeId);
  if (!Number.isSafeInteger(providerId) || !Number.isSafeInteger(employeeId)) notFound();
  const session = await require_provider_access(providerId, employeeId);

  const repositories = get_repositories();
  const employee = await repositories.providerEmployees.get_employee(employeeId);
  if (!employee || employee.providerId !== providerId) notFound();

  const [provider, semaphoreState, photo] = await Promise.all([
    repositories.providers.get_provider(providerId),
    repositories.providerEmployees.get_semaphore(employeeId),
    repositories.providerEmployees.get_current_photo(employeeId),
  ]);
  const semaphore = semaphoreState?.semaphore ?? null;
  const fullName = [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]
    .filter(Boolean)
    .join(" ");
  const canGenerate = employee.active && semaphore === "VERDE" && photo !== null;
  const qrImage = canGenerate
    ? await QRCode.toDataURL(create_access_token(employeeId), { errorCorrectionLevel: "M", margin: 2, width: 320 })
    : null;

  const missing = [
    !employee.active ? "el colaborador está dado de baja" : null,
    semaphore === "VERDE" ? null : "el semáforo debe estar en verde",
    photo ? null : "falta su fotografía",
  ].filter((item): item is string => item !== null);

  const canManage = can_manage_provider(session, providerId);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          ...(session.kind === "EMPLEADO" ? [{ label: "Control de contratistas", href: "/contratistas" }] : []),
          ...(canManage || session.kind === "EMPLEADO" ? [{ label: "Personal", href: `/contratistas/${providerId}/personal` }] : []),
          { label: fullName, href: `/contratistas/${providerId}/personal/${employeeId}/documentos` },
          { label: "Acceso a planta" },
        ]}
      />
      <h1 className="mb-4 text-4xl uppercase">Acceso a planta</h1>

      {qrImage && photo ? (
        <section className={`${cardClass} mx-auto max-w-sm text-center`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- la foto sale de una ruta protegida con sesión */}
          <img
            src={`/api/colaboradores/${employeeId}/foto`}
            alt={`Fotografía de ${fullName}`}
            className="mx-auto mb-3 h-48 w-40 rounded border border-neutral-light object-cover"
          />
          <h2 className="text-2xl uppercase">{fullName}</h2>
          <p className="text-neutral-dark">{employee.jobTitle}</p>
          <p className="mb-3 font-bold text-brand-navy">{provider?.name}</p>
          <p className="mb-2 text-sm">
            Semáforo: <SemaphoreBadge semaphore={semaphore} />
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el servidor (data URL) */}
          <img src={qrImage} alt="Código QR de acceso a planta" className="mx-auto h-64 w-64" />
          <p className="mt-2 text-xs text-neutral-dark">
            Muéstralo en la caseta de vigilancia. Si tu semáforo cambia de verde, el QR dejará de servir aunque lo tengas guardado.
          </p>
        </section>
      ) : (
        <section className={cardClass}>
          <p role="alert" className="text-sm text-red-700">
            Aún no se puede generar la pantalla de acceso: {missing.join("; ")}.
          </p>
        </section>
      )}

      <p className="mt-4 text-sm">
        <Link
          href={`/contratistas/${providerId}/personal/${employeeId}/documentos`}
          className="font-bold text-brand-navy underline"
        >
          Volver a la ficha
        </Link>
      </p>
    </>
  );
}
