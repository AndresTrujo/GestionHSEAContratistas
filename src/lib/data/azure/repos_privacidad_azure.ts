import type { PrivacyAcceptance } from "@/domain/privacidad";
import type { PrivacyConsentRepository } from "../repositorios";
import { get_db, is_unique_violation } from "./conexion";

interface AcceptanceRow {
  id: string;
  actor_tipo: PrivacyAcceptance["actorType"];
  actor_id: string;
  version_aviso: string;
  hash_aviso: string;
  aceptado_en: Date;
  direccion_ip: string;
  agente_usuario: string;
}

function map_acceptance(row: AcceptanceRow): PrivacyAcceptance {
  return {
    id: row.id,
    actorType: row.actor_tipo,
    actorId: row.actor_id,
    noticeVersion: row.version_aviso,
    noticeHash: row.hash_aviso,
    acceptedAt: row.aceptado_en.toISOString(),
    ipAddress: row.direccion_ip,
    userAgent: row.agente_usuario,
  };
}

export function create_privacy_consent_repository_azure(): PrivacyConsentRepository {
  return {
    async has_accepted(actorId, noticeVersion) {
      const { rows } = await get_db().query<{ id: string }>(
        `SELECT TOP 1 id FROM aceptaciones_aviso_privacidad WHERE actor_id = $1 AND version_aviso = $2`,
        [actorId, noticeVersion],
      );
      return rows.length > 0;
    },
    async record_acceptance(input) {
      try {
        await get_db().query(
          `INSERT INTO aceptaciones_aviso_privacidad
             (actor_tipo, actor_id, version_aviso, hash_aviso, direccion_ip, agente_usuario)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [input.actorType, input.actorId, input.noticeVersion, input.noticeHash, input.ipAddress, input.userAgent],
        );
        return true;
      } catch (error) {
        // Doble clic o dos pestañas: ya existe la evidencia de esa versión.
        if (is_unique_violation(error)) return false;
        throw error;
      }
    },
    async list_by_actor(actorId) {
      const { rows } = await get_db().query<AcceptanceRow>(
        `SELECT * FROM aceptaciones_aviso_privacidad WHERE actor_id = $1 ORDER BY aceptado_en DESC`,
        [actorId],
      );
      return rows.map(map_acceptance);
    },
  };
}
