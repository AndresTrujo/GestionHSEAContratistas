import { describe, expect, it } from "vitest";
import { detect_file_type } from "./tipo_archivo";

describe("detect_file_type", () => {
  it("reconoce un PDF por su firma", () => {
    expect(detect_file_type(Buffer.from("%PDF-1.7 contenido"))?.extension).toBe("pdf");
  });

  it("reconoce JPEG y PNG por sus bytes", () => {
    expect(detect_file_type(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))?.mimeType).toBe("image/jpeg");
    expect(detect_file_type(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))?.mimeType).toBe("image/png");
  });

  it("rechaza lo demás, aunque se llame .pdf", () => {
    expect(detect_file_type(Buffer.from("MZ ejecutable disfrazado"))).toBeNull();
    expect(detect_file_type(Buffer.from(""))).toBeNull();
  });
});
