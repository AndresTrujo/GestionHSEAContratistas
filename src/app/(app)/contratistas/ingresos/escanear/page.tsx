import Link from "next/link";
import { AccessScanner } from "@/components/contratistas/EscanerAcceso";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface ScanAccessPageProps {
  searchParams: Promise<{ salida?: string }>;
}

export default async function ScanAccessPage({ searchParams }: ScanAccessPageProps) {
  await require_employee_permission("contratistas:registrar_ingresos");
  const { salida } = await searchParams;

  // Salida iniciada desde "Dentro de planta": se espera el QR de ese colaborador.
  let expected: { entryId: string; name: string } | null = null;
  if (salida) {
    const { entries, providerEmployees } = get_repositories();
    const open = (await entries.list_open_entries()).find((entry) => entry.id === salida);
    if (open) {
      const employee = await providerEmployees.get_employee(open.providerEmployeeId);
      expected = {
        entryId: open.id,
        name: employee
          ? [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname].filter(Boolean).join(" ")
          : `Colaborador ${open.providerEmployeeId}`,
      };
    }
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Control de contratistas", href: "/contratistas" },
          { label: "Ingresos a planta", href: "/contratistas/ingresos" },
          { label: expected ? "Registrar salida" : "Escanear QR" },
        ]}
      />
      <PageHeader
        title={expected ? "Registrar salida" : "Escanear QR de acceso"}
        subtitle={
          expected
            ? "La salida se valida con el QR del propio colaborador."
            : "Sirve para entrar y para salir. Solo pasa quien está en semáforo verde; amarillo, rojo o un QR no válido se rebotan y el intento queda en la bitácora."
        }
      />
      {salida && !expected && (
        <p role="alert" className="mb-6 rounded-xl border border-yellow-500 bg-yellow-50 px-4 py-3 text-sm">
          Ese ingreso ya no está abierto (la salida ya se registró). Puedes escanear otro QR.
        </p>
      )}
      <AccessScanner expected={expected} />
      <p className="mt-6 text-center text-sm">
        <Link href="/contratistas/ingresos" className="font-bold text-brand-navy underline">
          Volver a ingresos a planta
        </Link>
      </p>
    </>
  );
}
