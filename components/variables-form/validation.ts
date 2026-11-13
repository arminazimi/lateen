/**
 * The declared types a variable can be validated as. `string` is the fallback: an unknown type, or none,
 * accepts any text. The type never changes the control — every variable stays a text input — it only
 * decides whether a value may reach an example.
 */
export type ValidationType = "string" | "url" | "number" | "boolean";

/** The declared type reduced to one of the four validation rules; anything else is `string`. */
export function validationTypeOf(raw: unknown): ValidationType {
  const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return name === "url" || name === "number" || name === "boolean" ? name : "string";
}

/** Whitespace or a control character; a URL may carry neither. */
const UNSAFE = /[\s\u0000-\u001f\u007f]/;

/**
 * True when `value` is a non-empty absolute `http:`/`https:` URL or a root-relative path that starts with
 * exactly one `/`. Protocol-relative paths (`//host`) and any whitespace or control character are rejected.
 * Nothing here requests the URL; it only checks the shape the contract states.
 */
export function isUrl(value: string): boolean {
  if (value === "" || UNSAFE.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "";
  } catch {
    return false;
  }
}

/** A decimal number with an optional sign, fraction, and exponent; the empty string is not a number. */
const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/** True when `value` matches the declared type's contract. `string` accepts everything, including empty. */
export function isValidValue(type: ValidationType, value: string): boolean {
  switch (type) {
    case "url":
      return isUrl(value);
    case "number":
      return NUMBER.test(value);
    case "boolean":
      return /^(true|false)$/i.test(value);
    case "string":
      return true;
  }
}
