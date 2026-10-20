/**
 * Escapes text for interpolation into HTML assembled as a string, element content or a
 * quoted attribute value: the email bodies, where donor- and applicant-typed fields arrive
 * straight from a public form, and the proxy's 403 document.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
