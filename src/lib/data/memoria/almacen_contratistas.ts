import type { AuditMetadata } from "@/domain/auditoria";
import type {
  ContractorDocument,
  DocumentReview,
  DocumentVersion,
  EmployeePhoto,
  EntryRecord,
  PermitParticipant,
  Provider,
  ProviderEmployee,
  ProviderEquipment,
  ProviderUser,
} from "@/domain/contratistas";
import { hash_secret } from "@/lib/auth/secreto";

/** Usuario con el hash de su contraseña; el hash nunca sale de la capa de datos. */
export interface StoredProviderUser extends ProviderUser {
  passwordHash: string;
}

export interface ContractorStore {
  providers: Provider[];
  users: StoredProviderUser[];
  employees: ProviderEmployee[];
  equipment: ProviderEquipment[];
  documents: ContractorDocument[];
  versions: DocumentVersion[];
  reviews: DocumentReview[];
  entries: EntryRecord[];
  photos: EmployeePhoto[];
  participants: PermitParticipant[];
  nextId: {
    provider: number;
    user: number;
    employee: number;
    equipment: number;
    document: number;
    version: number;
    review: number;
    entry: number;
    photo: number;
    participant: number;
  };
}

const seedAudit: AuditMetadata = {
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "seed",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "seed",
};

/**
 * Datos de demostración (solo modo memoria). Cuentas de proveedor de prueba:
 *   jupelo01 / Demo1234  (Servicios Industriales Demo)
 *   carudi02 / Demo1234  (Mantenimiento Norte Demo)
 * Los colaboradores arrancan en ROJO (sin documentos). CURP/NSS son ficticios.
 */
export function create_contractor_store(): ContractorStore {
  const demoPasswordHash = hash_secret("Demo1234");

  const providers: Provider[] = [
    {
      id: 1,
      name: "Servicios Industriales Demo",
      taxId: "SID010101AAA",
      imssEmployerRegistration: null,
      contactEmail: "contacto@servicios-demo.example",
      phone: null,
      status: "ACTIVO",
      contractorTypes: ["MANTENIMIENTO"],
      ...seedAudit,
    },
    {
      id: 2,
      name: "Mantenimiento Norte Demo",
      taxId: "MND020202BBB",
      imssEmployerRegistration: null,
      contactEmail: "contacto@norte-demo.example",
      phone: null,
      status: "ACTIVO",
      contractorTypes: ["REDES", "INFRAESTRUCTURA"],
      ...seedAudit,
    },
  ];

  const employees: ProviderEmployee[] = [
    {
      id: 1,
      providerId: 1,
      firstName: "Juan",
      middleName: null,
      paternalSurname: "Pérez",
      maternalSurname: "López",
      curp: "DEMO900101HDFXXX01",
      nss: "00000000001",
      jobTitle: "Técnico de mantenimiento",
      active: true,
      terminationDate: null,
      workTypes: [],
      ...seedAudit,
    },
    {
      id: 2,
      providerId: 1,
      firstName: "María",
      middleName: null,
      paternalSurname: "López",
      maternalSurname: "Gómez",
      curp: "DEMO900202MDFXXX02",
      nss: "00000000002",
      jobTitle: "Técnico en alturas",
      active: true,
      terminationDate: null,
      workTypes: ["ALTURAS"],
      ...seedAudit,
    },
    {
      id: 3,
      providerId: 2,
      firstName: "Carlos",
      middleName: null,
      paternalSurname: "Ruiz",
      maternalSurname: "Díaz",
      curp: "DEMO900303HDFXXX03",
      nss: "00000000003",
      jobTitle: "Técnico de redes",
      active: true,
      terminationDate: null,
      workTypes: [],
      ...seedAudit,
    },
  ];

  const users: StoredProviderUser[] = [
    {
      id: 1,
      providerId: 1,
      providerEmployeeId: null,
      name: "Juan Pérez López (admin demo)",
      username: "jupelo01",
      email: null,
      isAdministrator: true,
      active: true,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      passwordHash: demoPasswordHash,
      ...seedAudit,
    },
    {
      id: 2,
      providerId: 2,
      providerEmployeeId: null,
      name: "Carlos Ruiz Díaz (admin demo)",
      username: "carudi02",
      email: null,
      isAdministrator: true,
      active: true,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      passwordHash: demoPasswordHash,
      ...seedAudit,
    },
  ];

  return {
    providers,
    users,
    employees,
    equipment: [],
    documents: [],
    versions: [],
    reviews: [],
    entries: [],
    photos: [],
    participants: [],
    nextId: {
      provider: providers.length + 1,
      user: users.length + 1,
      employee: employees.length + 1,
      equipment: 1,
      document: 1,
      version: 1,
      review: 1,
      entry: 1,
      photo: 1,
      participant: 1,
    },
  };
}
