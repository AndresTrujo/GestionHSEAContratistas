import { describe, expect, it } from "vitest";
import { parse_csv, parse_employees_csv } from "./csv";

describe("parse_csv", () => {
  it("respeta comillas y comas dentro de una celda", () => {
    expect(parse_csv('a,b\n"x, y",z')).toEqual([["a", "b"], ["x, y", "z"]]);
  });

  it("detecta el punto y coma (Excel en español)", () => {
    expect(parse_csv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parse_employees_csv", () => {
  const header = "nombre,apellido_paterno,apellido_materno,curp,nss,puesto,trabajos";

  it("convierte los renglones en altas con sus trabajos específicos", () => {
    const parsed = parse_employees_csv(`${header}\nJuan,Pérez,López,CURP123,NSS456,Soldador,calientes alturas`);
    expect(parsed.error).toBeNull();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      firstName: "Juan",
      paternalSurname: "Pérez",
      jobTitle: "Soldador",
      workTypes: ["CALIENTES", "ALTURAS"],
    });
  });

  it("rechaza un archivo al que le faltan columnas obligatorias", () => {
    const parsed = parse_employees_csv("nombre,puesto\nJuan,Soldador");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.error).toMatch(/Faltan columnas/);
  });

  it("un archivo vacío es un error", () => {
    expect(parse_employees_csv("").error).not.toBeNull();
  });
});
