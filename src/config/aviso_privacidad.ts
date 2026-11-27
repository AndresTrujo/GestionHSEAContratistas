/**
 * Aviso de privacidad vigente. Al cambiar el texto, sube `privacyNoticeVersion`: todas las personas
 * vuelven a aceptarlo. Cada aceptación guarda la versión y el sha256 del texto aceptado.
 */
export const privacyNoticeVersion = "2026-11-27-borrador";

export const privacyNoticeTitle = "Aviso de privacidad";

export interface PrivacyNoticeSection {
  heading: string;
  paragraphs: string[];
}

// TODO: sustituir por el texto oficial del aviso de privacidad (pendiente de entregar).
export const privacyNoticeSections: PrivacyNoticeSection[] = [
  {
    heading: "Texto pendiente",
    paragraphs: ["Aquí va el texto íntegro del aviso de privacidad integral."],
  },
];
