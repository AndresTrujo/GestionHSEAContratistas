import Link from "next/link";
import { AdminForm } from "@/components/administracion/AdminForm";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import { contractorTypes } from "@/config/tipos_contratista";
import { register_provider_action } from "@/lib/contratistas/acciones";

/** Autorregistro de empresas contratistas (pública). Queda pendiente hasta que HSEA la valide. */
export default function ProviderRegistrationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-8">
      <div className="w-full max-w-lg rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-3xl uppercase text-brand-navy">Registro de contratistas</h1>
        <p className="mb-5 text-sm text-neutral-dark">
          Registra a tu empresa. HSEA la validará y te entregará tu usuario y contraseña para dar de alta a tu
          personal y cargar su documentación.
        </p>

        <AdminForm action={register_provider_action} submitLabel="Enviar registro" className="space-y-3">
          <div>
            <label htmlFor="name" className={labelClass}>Razón social</label>
            <input id="name" name="name" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="taxId" className={labelClass}>RFC de la empresa</label>
            <input id="taxId" name="taxId" required maxLength={13} className={`${inputClass} uppercase`} />
          </div>
          <div>
            <label htmlFor="imssEmployerRegistration" className={labelClass}>Registro patronal del IMSS (opcional)</label>
            <input id="imssEmployerRegistration" name="imssEmployerRegistration" className={inputClass} />
          </div>
          <div>
            <label htmlFor="contactEmail" className={labelClass}>Correo de contacto</label>
            <input id="contactEmail" name="contactEmail" type="email" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>Teléfono (opcional)</label>
            <input id="phone" name="phone" type="tel" className={inputClass} />
          </div>
          <fieldset>
            <legend className={labelClass}>Giro de la empresa (puedes elegir varios)</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {contractorTypes.map((type) => (
                <label key={type.code} className="flex items-center gap-2">
                  <input type="checkbox" name="contractorTypes" value={type.code} />
                  {type.label}
                </label>
              ))}
            </div>
          </fieldset>
          {/* Señuelo para robots: las personas no lo ven ni lo llenan. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website">Sitio web</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
        </AdminForm>

        <p className="mt-4 text-center text-sm">
          <Link href="/login?tipo=proveedor" className="text-neutral-dark underline hover:text-brand-navy">
            Ya tengo cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}
