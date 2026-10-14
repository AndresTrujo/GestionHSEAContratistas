import { pinLength } from "@/config/seguridad";
import { hash_secret, verify_secret } from "./secreto";

export function is_valid_pin_format(pin: string): boolean {
  return new RegExp(`^\\d{${pinLength}}$`).test(pin);
}

/** Hash con sal (scrypt). Nunca se guarda el PIN. */
export function hash_pin(pin: string): string {
  return hash_secret(pin);
}

export function verify_pin_hash(pin: string, stored: string): boolean {
  return verify_secret(pin, stored);
}
