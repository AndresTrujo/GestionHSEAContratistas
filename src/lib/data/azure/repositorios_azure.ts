import type { DataRepositories } from "../repositorios";
import { create_audit_repository_azure } from "./auditoria_azure";
import { create_organization_repositories_azure } from "./repos_organizacion_azure";
import { create_permit_repository_azure } from "./repos_permisos_azure";
import { create_server_log_repository_azure } from "./registro_servidor_azure";
import { create_contractor_repositories_azure } from "./repos_contratistas_azure";

/** Todos los repositorios sobre Azure SQL (T-SQL). El pool de conexiones es único por proceso. */
export function create_azure_repositories(): DataRepositories {
  return {
    audit: create_audit_repository_azure(),
    serverLog: create_server_log_repository_azure(),
    permits: create_permit_repository_azure(),
    ...create_organization_repositories_azure(),
    ...create_contractor_repositories_azure(),
  };
}
