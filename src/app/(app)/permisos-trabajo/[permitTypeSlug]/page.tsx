import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { find_permit_type } from "@/config/tipos_permiso";

interface PermitTypePageProps {
  params: Promise<{ permitTypeSlug: string }>;
}

export default async function PermitTypePage({ params }: PermitTypePageProps) {
  const { permitTypeSlug } = await params;
  const permitType = find_permit_type(permitTypeSlug);
  if (!permitType) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: permitType.name },
        ]}
      />
      <p className="text-sm text-neutral-dark">
        {permitType.formCode}
      </p>
      <h1 className="mb-2 text-4xl uppercase">{permitType.name}</h1>
      <p className="mb-1 text-neutral-dark">{permitType.description}</p>
      <p className="text-sm text-neutral-dark">{permitType.validityNote}</p>
    </>
  );
}
