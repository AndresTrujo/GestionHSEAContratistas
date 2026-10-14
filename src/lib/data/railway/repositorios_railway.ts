import type { DataRepositories } from "../repositorios";
import { create_audit_repository_railway } from "./auditoria_railway";
import { create_contractor_repositories_railway } from "./repos_contratistas_railway";
import { create_organization_repositories_railway } from "./repos_organizacion_railway";
import { create_permit_repository_railway } from "./repos_permisos_railway";
import { create_server_log_repository_railway } from "./registro_servidor_railway";

/** Todos los repositorios sobre PostgreSQL (Railway). El pool de conexiones es único por proceso. */
export function create_railway_repositories(): DataRepositories {
  return {
    audit: create_audit_repository_railway(),
    serverLog: create_server_log_repository_railway(),
    permits: create_permit_repository_railway(),
    ...create_organization_repositories_railway(),
    ...create_contractor_repositories_railway(),
  };
}
