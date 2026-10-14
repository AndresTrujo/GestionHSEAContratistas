import { beforeEach, describe, expect, it } from "vitest";
import { clear_login_failures, format_wait, get_lockout_seconds, record_login_failure } from "./limite_intentos";

const keys = ["prueba:clave"];
const minute = 60_000;

beforeEach(() => clear_login_failures(keys));

describe("límite de intentos de inicio de sesión", () => {
  it("permite 2 fallos y bloquea 1 minuto en el tercero", () => {
    const start = 1_000_000;
    expect(record_login_failure(keys, start)).toBe(0);
    expect(record_login_failure(keys, start)).toBe(0);
    expect(record_login_failure(keys, start)).toBe(60);
    expect(get_lockout_seconds(keys, start + 10_000)).toBe(50);
    expect(get_lockout_seconds(keys, start + minute)).toBe(0);
  });

  it("los bloqueos suben a 3, 5 y 10 minutos y el último se repite", () => {
    let now = 1_000_000;
    for (let attempt = 0; attempt < 2; attempt += 1) record_login_failure(keys, now);
    const waits: number[] = [];
    for (let lock = 0; lock < 5; lock += 1) {
      waits.push(record_login_failure(keys, now));
      now += 11 * minute; // pasa el bloqueo; un solo fallo más vuelve a bloquear
    }
    expect(waits).toEqual([60, 180, 300, 600, 600]);
  });

  it("un inicio correcto limpia el conteo", () => {
    const now = 1_000_000;
    record_login_failure(keys, now);
    record_login_failure(keys, now);
    clear_login_failures(keys);
    expect(record_login_failure(keys, now)).toBe(0);
  });

  it("tras una hora sin fallos el escalón vuelve a empezar", () => {
    const now = 1_000_000;
    for (let attempt = 0; attempt < 3; attempt += 1) record_login_failure(keys, now);
    const later = now + 61 * minute;
    record_login_failure(keys, later);
    record_login_failure(keys, later);
    expect(record_login_failure(keys, later)).toBe(60);
  });

  it("da formato a la espera", () => {
    expect(format_wait(45)).toBe("45 segundos");
    expect(format_wait(60)).toBe("1 minuto");
    expect(format_wait(180)).toBe("3 minutos");
  });
});
