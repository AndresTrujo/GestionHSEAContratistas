/** Datos que caseta ve al escanear el QR de un colaborador. */
export interface ScannedPerson {
  employeeId: number;
  name: string;
  jobTitle: string;
  company: string;
  /** null si no tiene fotografía vigente. */
  photoUrl: string | null;
}

/** Resultado de escanear un QR en caseta. */
export type ScanResult =
  | { kind: "RECHAZADO"; message: string; person?: ScannedPerson }
  | { kind: "LISTO_ENTRADA"; person: ScannedPerson }
  | { kind: "LISTO_SALIDA"; person: ScannedPerson; entryId: string; enteredAt: string };
