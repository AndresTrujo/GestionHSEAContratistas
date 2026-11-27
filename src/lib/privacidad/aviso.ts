import { createHash } from "node:crypto";
import { privacyNoticeSections, privacyNoticeTitle, privacyNoticeVersion } from "@/config/aviso_privacidad";

/** sha256 del texto íntegro del aviso: deja constancia de qué se aceptó. */
export function get_privacy_notice_hash(): string {
  const content = JSON.stringify([privacyNoticeVersion, privacyNoticeTitle, privacyNoticeSections]);
  return createHash("sha256").update(content).digest("hex");
}
