import { describe, expect, it } from "vitest";
import type { PrivacyAcceptance } from "@/domain/privacidad";
import { create_privacy_consent_repository } from "./repos_privacidad_memoria";

const base = {
  actorType: "EMPLEADO" as const,
  actorId: "204692",
  noticeVersion: "v1",
  noticeHash: "abc",
  ipAddress: "10.0.0.1",
  userAgent: "test",
};

describe("aceptación del aviso de privacidad", () => {
  it("solo cuenta como aceptada la versión registrada para esa persona", async () => {
    const repository = create_privacy_consent_repository([] as PrivacyAcceptance[]);
    expect(await repository.has_accepted("204692", "v1")).toBe(false);

    expect(await repository.record_acceptance(base)).toBe(true);
    expect(await repository.has_accepted("204692", "v1")).toBe(true);
    expect(await repository.has_accepted("204692", "v2")).toBe(false);
    expect(await repository.has_accepted("P-1", "v1")).toBe(false);
  });

  it("no duplica la evidencia al aceptar dos veces la misma versión", async () => {
    const repository = create_privacy_consent_repository([] as PrivacyAcceptance[]);
    await repository.record_acceptance(base);
    expect(await repository.record_acceptance(base)).toBe(false);
    expect(await repository.list_by_actor("204692")).toHaveLength(1);
  });
});
