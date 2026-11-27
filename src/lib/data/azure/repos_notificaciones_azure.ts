import { createHash } from "node:crypto";
import type {
  NotificationKind,
  NotificationLogEntry,
  NotificationRecipient,
  NotificationStatus,
  PushSubscriptionRecord,
} from "@/domain/notificaciones";
import type { NotificationRepository } from "../repositorios";
import { get_db, with_transaction } from "./conexion";

interface SubscriptionRow {
  id: string | number;
  propietario_tipo: NotificationRecipient["kind"];
  propietario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  agente_usuario: string | null;
  creada_en: Date;
  ultimo_uso_en: Date | null;
  revocada_en: Date | null;
  motivo_revocacion: string | null;
}

interface LogRow {
  id: string | number;
  permiso_id: string;
  tipo_permiso_slug: string;
  clave_firma: string | null;
  destinatario_tipo: NotificationRecipient["kind"];
  destinatario_id: string;
  tipo: NotificationKind;
  titulo: string;
  mensaje: string;
  url: string;
  estatus: NotificationStatus;
  dispositivos_enviados: number;
  dispositivos_fallidos: number;
  error: string | null;
  enviada_en: Date;
}

const subscriptionColumns = `id, propietario_tipo, propietario_id, endpoint, p256dh, auth, agente_usuario,
  creada_en, ultimo_uso_en, revocada_en, motivo_revocacion`;

function hash_endpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function map_subscription(row: SubscriptionRow): PushSubscriptionRecord {
  return {
    id: String(row.id),
    owner: { kind: row.propietario_tipo, id: row.propietario_id },
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.agente_usuario,
    createdAt: row.creada_en.toISOString(),
    lastUsedAt: row.ultimo_uso_en ? row.ultimo_uso_en.toISOString() : null,
    revokedAt: row.revocada_en ? row.revocada_en.toISOString() : null,
    revokedReason: row.motivo_revocacion,
  };
}

function map_log(row: LogRow): NotificationLogEntry {
  return {
    id: String(row.id),
    permitId: row.permiso_id,
    permitTypeSlug: row.tipo_permiso_slug,
    signatureKey: row.clave_firma,
    recipient: { kind: row.destinatario_tipo, id: row.destinatario_id },
    kind: row.tipo,
    title: row.titulo,
    body: row.mensaje,
    url: row.url,
    status: row.estatus,
    devicesSent: row.dispositivos_enviados,
    devicesFailed: row.dispositivos_fallidos,
    error: row.error,
    sentAt: row.enviada_en.toISOString(),
  };
}

/**
 * suscripciones_push y notificaciones_push tienen triggers: no se usa OUTPUT sin INTO, se lee con
 * SCOPE_IDENTITY() o por clave.
 */
export function create_notification_repository_azure(): NotificationRepository {
  return {
    async save_subscription(input) {
      const endpointHash = hash_endpoint(input.endpoint);
      return with_transaction(async (db) => {
        await db.query(
          `UPDATE suscripciones_push SET revocada_en = SYSDATETIMEOFFSET(), motivo_revocacion = N'REEMPLAZADA'
            WHERE endpoint_hash = $1 AND revocada_en IS NULL`,
          [endpointHash],
        );
        const { rows } = await db.query<SubscriptionRow>(
          `INSERT INTO suscripciones_push (propietario_tipo, propietario_id, endpoint, endpoint_hash, p256dh, auth, agente_usuario)
           VALUES ($1, $2, $3, $4, $5, $6, $7);
           SELECT ${subscriptionColumns} FROM suscripciones_push WHERE id = SCOPE_IDENTITY();`,
          [input.owner.kind, input.owner.id, input.endpoint, endpointHash, input.p256dh, input.auth, input.userAgent],
        );
        const row = rows[0];
        if (!row) throw new Error("No se pudo guardar la suscripción push");
        return map_subscription(row);
      });
    },
    async revoke_subscription(endpoint, reason) {
      const { rows } = await get_db().query<SubscriptionRow>(
        `DECLARE @id bigint = (SELECT id FROM suscripciones_push WHERE endpoint_hash = $1 AND revocada_en IS NULL);
         UPDATE suscripciones_push SET revocada_en = SYSDATETIMEOFFSET(), motivo_revocacion = $2 WHERE id = @id;
         SELECT ${subscriptionColumns} FROM suscripciones_push WHERE id = @id;`,
        [hash_endpoint(endpoint), reason],
      );
      const row = rows[0];
      return row ? map_subscription(row) : null;
    },
    async list_active_subscriptions(owner) {
      const { rows } = await get_db().query<SubscriptionRow>(
        `SELECT ${subscriptionColumns} FROM suscripciones_push
          WHERE propietario_tipo = $1 AND propietario_id = $2 AND revocada_en IS NULL
          ORDER BY id`,
        [owner.kind, owner.id],
      );
      return rows.map(map_subscription);
    },
    async mark_subscriptions_used(subscriptionIds, usedAt) {
      if (subscriptionIds.length === 0) return;
      await get_db().query(
        `UPDATE suscripciones_push SET ultimo_uso_en = CAST($2 AS datetimeoffset(3))
          WHERE id IN (SELECT CAST(value AS bigint) FROM OPENJSON($1))`,
        [JSON.stringify(subscriptionIds), usedAt],
      );
    },
    async append_log(entry) {
      const { rows } = await get_db().query<LogRow>(
        `INSERT INTO notificaciones_push (permiso_id, tipo_permiso_slug, clave_firma, destinatario_tipo, destinatario_id,
           tipo, titulo, mensaje, url, estatus, dispositivos_enviados, dispositivos_fallidos, error, enviada_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CAST($14 AS datetimeoffset(3)));
         SELECT * FROM notificaciones_push WHERE id = SCOPE_IDENTITY();`,
        [
          entry.permitId,
          entry.permitTypeSlug,
          entry.signatureKey,
          entry.recipient.kind,
          entry.recipient.id,
          entry.kind,
          entry.title,
          entry.body,
          entry.url,
          entry.status,
          entry.devicesSent,
          entry.devicesFailed,
          entry.error,
          entry.sentAt,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("No se pudo registrar la notificación");
      return map_log(row);
    },
    async list_log_by_permit(permitId) {
      const { rows } = await get_db().query<LogRow>(
        `SELECT * FROM notificaciones_push WHERE permiso_id = $1 ORDER BY id`,
        [permitId],
      );
      return rows.map(map_log);
    },
    async try_acquire_lease(taskName, instanceId, seconds) {
      // Toma el candado si está vencido o ya es de esta instancia; si no existe, lo crea (un choque de
      // inserción entre instancias lo pierde una de las dos).
      const { rows } = await get_db().query<{ instancia: string }>(
        `UPDATE tareas_programadas
            SET bloqueada_hasta = DATEADD(second, $3, SYSDATETIMEOFFSET()), instancia = $2
          WHERE nombre = $1 AND (bloqueada_hasta < SYSDATETIMEOFFSET() OR instancia = $2);
         IF NOT EXISTS (SELECT 1 FROM tareas_programadas WHERE nombre = $1)
         BEGIN TRY
           INSERT INTO tareas_programadas (nombre, bloqueada_hasta, instancia)
           VALUES ($1, DATEADD(second, $3, SYSDATETIMEOFFSET()), $2);
         END TRY
         BEGIN CATCH
         END CATCH;
         SELECT instancia FROM tareas_programadas WHERE nombre = $1;`,
        [taskName, instanceId, seconds],
      );
      return rows[0]?.instancia === instanceId;
    },
  };
}
