import { describe, expect, it } from "vitest";
import { get_next_signatures, get_pending_signatures } from "@/config/notificaciones";
import type { NotificationKind, NotificationLogEntry } from "@/domain/notificaciones";
import type { PermitStatus, WorkPermit } from "@/domain/permisos";
import { decide_reminder } from "./reglas";

// 10:00 en CDMX (UTC-6): dentro del horario de recordatorios (08:00 a 18:00).
const start = Date.parse("2026-11-10T16:00:00.000Z");

function minutes_after(minutes: number): string {
  return new Date(start + minutes * 60_000).toISOString();
}

function make_entry(kind: NotificationKind, minutes: number): NotificationLogEntry {
  return {
    id: crypto.randomUUID(),
    permitId: "p1",
    permitTypeSlug: "trabajos-calientes",
    signatureKey: "hsea",
    recipient: { kind: "EMPLEADO", id: "204692" },
    kind,
    title: "",
    body: "",
    url: "/",
    status: "ENVIADA",
    devicesSent: 1,
    devicesFailed: 0,
    error: null,
    sentAt: minutes_after(minutes),
  };
}

function make_permit(permitTypeSlug: string, status: PermitStatus, signedKeys: string[], fields: WorkPermit["fields"] = {}): WorkPermit {
  return {
    id: "p1",
    permitTypeSlug,
    status,
    requestedByEmployeeNumber: "100",
    providerId: null,
    area: { departmentId: 1, subdepartmentId: null },
    signatures: signedKeys.map((key) => ({ key, employeeNumber: "1", signedAt: minutes_after(0), image: null })),
    fields,
    createdAt: minutes_after(0),
    createdBy: "100",
    updatedAt: minutes_after(0),
    updatedBy: "100",
  };
}

describe("decide_reminder", () => {
  it("no recuerda lo que nunca se avisó", () => {
    expect(decide_reminder([], new Date(minutes_after(120)))).toEqual({ due: false });
  });

  it("espera 15 minutos desde el aviso", () => {
    const entries = [make_entry("PENDIENTE", 0)];
    expect(decide_reminder(entries, new Date(minutes_after(14)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(15)))).toEqual({ due: true, reminderNumber: 1 });
  });

  it("cuenta desde el último recordatorio", () => {
    const entries = [make_entry("PENDIENTE", 0), make_entry("RECORDATORIO", 16)];
    expect(decide_reminder(entries, new Date(minutes_after(30)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(31)))).toEqual({ due: true, reminderNumber: 2 });
  });

  it("después de 3 recordatorios sigue uno por hora", () => {
    const entries = [
      make_entry("PENDIENTE", 0),
      make_entry("RECORDATORIO", 15),
      make_entry("RECORDATORIO", 30),
      make_entry("RECORDATORIO", 45),
    ];
    expect(decide_reminder(entries, new Date(minutes_after(100)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(105)))).toEqual({ due: true, reminderNumber: 4 });
  });

  it("no envía fuera del horario y retoma al abrir la ventana", () => {
    // Aviso a las 17:50; a las 18:20 ya no se envía; al día siguiente a las 08:00 (14:00 UTC) sí.
    const entries = [make_entry("PENDIENTE", 470)];
    expect(decide_reminder(entries, new Date(minutes_after(500)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(14 * 60)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(22 * 60)))).toEqual({ due: true, reminderNumber: 1 });
  });

  it("ignora los avisos de avance al solicitante", () => {
    const entries = [make_entry("AVANCE", 0)];
    expect(decide_reminder(entries, new Date(minutes_after(60)))).toEqual({ due: false });
  });
});

describe("get_pending_signatures", () => {
  it("lista las aprobaciones que faltan del permiso de trabajos calientes", () => {
    const permit = make_permit("trabajos-calientes", "submitted", ["requester", "hsea"]);
    expect(get_pending_signatures(permit).map((item) => item.key)).toEqual(["executor", "tfs_executor", "operational_manager"]);
  });

  it("en espacios confinados aprobado solo falta el cierre de HSEA", () => {
    const permit = make_permit("espacios-confinados", "approved", ["requester", "operational_manager", "medical_service", "lookout"]);
    expect(get_pending_signatures(permit).map((item) => item.key)).toEqual(["hsea"]);
  });

  it("incluye a los participantes del JSA", () => {
    const permit = make_permit("analisis-seguridad-jsa", "submitted", ["executor"], { participant1Name: "Ana", participant2Name: "Luis" });
    expect(get_pending_signatures(permit).map((item) => item.key)).toEqual([
      "operational_manager",
      "hsea",
      "participant_1",
      "participant_2",
    ]);
  });

  it("el ingreso de celular no notifica", () => {
    const permit = make_permit("ingreso-telefono-celular", "submitted", []);
    expect(get_pending_signatures(permit)).toEqual([]);
  });

  it("un permiso cerrado no tiene firmas pendientes", () => {
    const permit = make_permit("observacion-preventiva-stop", "closed", []);
    expect(get_pending_signatures(permit)).toEqual([]);
  });
});

describe("get_next_signatures", () => {
  it("en trabajos calientes avisa solo a quien sigue en la secuencia", () => {
    const permit = make_permit("trabajos-calientes", "submitted", ["requester"]);
    expect(get_next_signatures(permit).map((item) => item.key)).toEqual(["executor"]);
  });

  it("avanza al siguiente cuando firma el anterior", () => {
    const permit = make_permit("trabajos-calientes", "submitted", ["requester", "executor"]);
    expect(get_next_signatures(permit).map((item) => item.key)).toEqual(["operational_manager"]);
  });

  it("en el JSA los participantes firman primero y después el responsable del área", () => {
    const permit = make_permit("analisis-seguridad-jsa", "submitted", ["executor"], { participant1Name: "Ana" });
    expect(get_next_signatures(permit).map((item) => item.key)).toEqual(["participant_1"]);
  });
});

