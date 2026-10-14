import { primaryButtonClass } from "@/components/administracion/estilos";
import { ContractorPicker } from "@/components/permisos/ContractorPicker";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { phoneSlug, phoneValidityMonths } from "@/config/ingreso_celular";
import { find_permit_type } from "@/config/tipos_permiso";
import { require_permit_actor } from "@/lib/permisos/actor";
import { load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_phone_permit } from "@/lib/permisos/ingreso_celular_acciones";

interface NewPhonePageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewPhonePermitPage({ searchParams }: NewPhonePageProps) {
  const { error } = await searchParams;
  const executorOptions = await load_executor_options(await require_permit_actor());
  const today = new Date().toLocaleDateString("en-CA");
  const permitType = find_permit_type(phoneSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Ingreso con teléfono celular", href: `/permisos-trabajo/${phoneSlug}` },
          { label: "Nuevo" },
        ]}
      />
      <PageHeader
        title="Autorización para el ingreso con teléfono celular a planta TFS"
        eyebrow={
          permitType && (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{permitType.formCode}</span>
          )
        }
        subtitle={`Vigencia de ${phoneValidityMonths} meses a partir de la última firma. El número de oficio se asigna automáticamente.`}
      />

      {error === "incomplete" && <FormAlert>Completa todos los campos.</FormAlert>}
      {error === "contractor" && (
        <FormAlert>
          El proveedor o el contratista elegido no es válido. Solo pueden elegirse colaboradores activos con semáforo verde.
        </FormAlert>
      )}

      <form action={create_phone_permit} className="space-y-6">
        <SectionCard step={1} title="Datos generales" description="Fecha, área y contratista que recibe la autorización.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField />
            <PermitField label="Fecha" name="date" type="date" defaultValue={today} />
            <ContractorPicker options={executorOptions} />
          </div>
        </SectionCard>

        <SectionCard step={2} title="Datos del celular">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="Marca" name="phoneBrand" />
            <PermitField label="Modelo" name="phoneModel" />
          </div>
        </SectionCard>

        <p className="rounded-xl border border-neutral-light bg-neutral-light/20 px-4 py-3 text-sm">
          Se hace de su conocimiento que el contratista queda autorizado para
          ingresar a la instalación TFS portando teléfono celular, exclusivamente
          con fines laborales y de comunicación operativa. Su uso deberá limitarse
          estrictamente a asuntos de trabajo, cumpliendo con las políticas internas
          de seguridad, confidencialidad y uso de dispositivos electrónicos, así
          como con las normas de seguridad industrial vigentes. Las firmas del
          contratista, el solicitante TFS y HSEA se registran después de crear el
          oficio.
        </p>

        <button type="submit" className={`${primaryButtonClass} px-8`}>
          Crear oficio
        </button>
      </form>
    </>
  );
}
