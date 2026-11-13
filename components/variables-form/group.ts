/**
 * The group identity that connects a variables form to the examples it drives. A form, a terminal, and an
 * output block belong together only when their `group` values match exactly. An authored group is
 * rendered with the explicit marker; a form without one derives its group from its own id, so a single
 * form on a page needs no group and terminals may stay ungrouped.
 */

/** Attribute that names the example group. */
export const GROUP_ATTRIBUTE = "data-variable-group";

/** Attribute that marks a group the author wrote, not one derived from the form id. */
export const GROUP_EXPLICIT_ATTRIBUTE = "data-variable-group-explicit";

/** Attribute the island sets on a form while one of its inputs is rejected. */
export const INVALID_ATTRIBUTE = "data-variables-invalid";

/** Attribute on the declared type, so the island validates without changing the text input. */
export const TYPE_ATTRIBUTE = "data-type";

/** Attribute that binds an error message to the variable name it describes. */
export const ERROR_ATTRIBUTE = "data-error-for";

/** Attribute carrying the localized reset announcement, so the island needs no catalog. */
export const RESET_TEXT_ATTRIBUTE = "data-reset-text";

/** Attribute carrying the localized reason a terminal copy is blocked. */
export const INVALID_TEXT_ATTRIBUTE = "data-invalid-text";

/** The group identifier contract: letters, digits, `_`, and `-`, never empty. */
export const GROUP_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * The authored group when it follows the contract, or undefined so the component derives one. A malformed
 * value is not silently rewritten into a different group.
 */
export function groupIdOf(raw: unknown): string | undefined {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text !== "" && GROUP_NAME.test(text) ? text : undefined;
}
