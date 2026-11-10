import { describe, expect, it } from "vitest";
import { get_pending_signatures } from "@/config/notificaciones";
import type { NotificationKind, NotificationLogEntry } from "@/domain/notificaciones";
import type { PermitStatus, WorkPermit } from "@/domain/permisos";
import { decide_reminder } from "./reglas";

const start = Date.parse("2026-11-10T12:00:00.000Z");

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

  it("espera 30 minutos desde el aviso", () => {
    const entries = [make_entry("PENDIENTE", 0)];
    expect(decide_reminder(entries, new Date(minutes_after(29)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(30)))).toEqual({ due: true, reminderNumber: 1 });
  });

  it("cuenta desde el último recordatorio", () => {
    const entries = [make_entry("PENDIENTE", 0), make_entry("RECORDATORIO", 31)];
    expect(decide_reminder(entries, new Date(minutes_after(55)))).toEqual({ due: false });
    expect(decide_reminder(entries, new Date(minutes_after(61)))).toEqual({ due: true, reminderNumber: 2 });
  });

  it("se detiene después de 3 recordatorios", () => {
    const entries = [
      make_entry("PENDIENTE", 0),
      make_entry("RECORDATORIO", 30),
      make_entry("RECORDATORIO", 60),
      make_entry("RECORDATORIO", 90),
    ];
    expect(decide_reminder(entries, new Date(minutes_after(240)))).toEqual({ due: false });
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
