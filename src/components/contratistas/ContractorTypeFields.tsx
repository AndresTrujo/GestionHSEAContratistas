"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import {
  contractorTypes,
  maxOtherContractorTypeLength,
  otherContractorTypeCode,
} from "@/config/tipos_contratista";

/**
 * Giro de la empresa en el autorregistro: casillas del catálogo y, con "Otro", un campo para que el proveedor
 * escriba su giro. El texto se limpia y se capitaliza en el servidor al guardarlo.
 */
export function ContractorTypeFields() {
  const [otherChecked, set_other_checked] = useState(false);

  return (
    <fieldset>
      <legend className={labelClass}>Giro de la empresa (puedes elegir varios)</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {contractorTypes.map((type) => (
          <label key={type.code} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="contractorTypes"
              value={type.code}
              onChange={
                type.code === otherContractorTypeCode ? (event) => set_other_checked(event.target.checked) : undefined
              }
            />
            {type.label}
          </label>
        ))}
      </div>
      {otherChecked && (
        <div className="mt-3">
          <label htmlFor="otherContractorType" className={labelClass}>¿Cuál es el giro de tu empresa?</label>
          <input
            id="otherContractorType"
            name="otherContractorType"
            required
            maxLength={maxOtherContractorTypeLength}
            autoComplete="off"
            className={inputClass}
          />
        </div>
      )}
    </fieldset>
  );
}
