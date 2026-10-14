/** Tipos de archivo aceptados, reconocidos por su contenido (no por el nombre ni el tipo que declara el navegador). */
export type DetectedFileType = {
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  extension: "pdf" | "jpg" | "png";
};

export function detect_file_type(data: Buffer): DetectedFileType | null {
  if (data.length >= 5 && data.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length >= 8 && pngSignature.every((byte, index) => data[index] === byte)) {
    return { mimeType: "image/png", extension: "png" };
  }
  return null;
}
