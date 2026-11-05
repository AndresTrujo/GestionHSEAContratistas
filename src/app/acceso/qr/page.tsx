import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanResultView } from "@/components/contratistas/ResultadoEscaneo";
import { scan_access_token_action } from "@/lib/acceso/acciones";
import { extract_access_token } from "@/lib/acceso/token_acceso";
import { get_session } from "@/lib/auth/sesion";

interface AccessQrPageProps {
  searchParams: Promise<{ t?: string }>;
}

/**
 * Destino del QR de acceso a planta cuando se escanea con la cámara nativa del teléfono. Sin sesión manda al login
 * y regresa aquí; sin permiso para registrar ingresos no muestra ningún dato de la persona (el resultado lo
 * decide `scan_access_token_action`, que valida sesión, permiso, firma y semáforo en vivo).
 */
export default async function AccessQrPage({ searchParams }: AccessQrPageProps) {
  const { t: rawToken = "" } = await searchParams;
  const token = extract_access_token(rawToken);

  const session = await get_session();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/acceso/qr?t=${token}`)}`);
  }
  if (session.kind === "USUARIO_PROVEEDOR" && session.mustChangePassword) redirect("/cambiar-password");

  const result = await scan_access_token_action(token);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-3xl uppercase text-brand-navy">Acceso a planta</h1>
      <ScanResultView
        result={result}
        scannedToken={token}
        footer={
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-brand-navy">
            <Link href="/contratistas/ingresos/escanear" className="underline">Abrir el escáner de la app</Link>
            <Link href="/inicio" className="underline">Ir al inicio</Link>
          </p>
        }
      />
    </main>
  );
}
