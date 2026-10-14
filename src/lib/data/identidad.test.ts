import { describe, expect, it } from "vitest";
import { add_months_to_date, get_date_mx } from "./identidad";

describe("add_months_to_date", () => {
  it("suma meses conservando el día", () => {
    expect(add_months_to_date("2026-10-05", 12)).toBe("2027-10-05");
  });

  it("si el día no existe en el mes destino, usa el último (como PostgreSQL)", () => {
    expect(add_months_to_date("2026-01-31", 1)).toBe("2026-02-28");
    expect(add_months_to_date("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("get_date_mx", () => {
  it("usa la fecha de Ciudad de México, no la de UTC", () => {
    // 03:00 UTC del 5 de octubre son las 21:00 del 4 de octubre en Ciudad de México.
    expect(get_date_mx("2026-10-05T03:00:00Z")).toBe("2026-10-04");
    expect(get_date_mx("2026-10-05T15:00:00Z")).toBe("2026-10-05");
  });
});
