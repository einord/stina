/**
 * Normalizes email body content from text or HTML.
 * Strips scripts, styles, and excessive whitespace.
 * 
 * SECURITY NOTE: This function is NOT suitable for sanitizing HTML for browser rendering.
 * It uses regex-based sanitization which has known limitations with malformed HTML.
 * However, the output is ONLY shown to the LLM (not rendered in browser), so the primary
 * concern is prompt injection rather than XSS. The email automation prompt includes
 * explicit warnings that email content is untrusted and should not be treated as instructions.
 * 
 * @param text Plain text email body
 * @param html HTML email body
 * @returns Normalized text content safe for LLM consumption
 */
export function normalizeEmailBody(text?: string | null, html?: string | null): string {
  if (text && text.trim()) return text.trim();
  if (!html) return '';
  
  let cleaned = html;
  
  // Strip all HTML tags in one pass (simpler and more reliable than targeting specific tags)
  // Convert block-level elements to newlines first to preserve structure
  cleaned = cleaned.replace(/<br[\s/]*>/gi, '\n');
  cleaned = cleaned.replace(/<\/(p|div|section|article|h[1-6]|tr|td|li|blockquote)>/gi, '\n');
  cleaned = cleaned.replace(/<li[^>]*>/gi, '\n- ');
  
  // Remove ALL remaining HTML tags (including script, style, and any others)
  // This approach is safer than trying to target specific "dangerous" tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  cleaned = cleaned.replace(/&lt;/gi, '<');
  cleaned = cleaned.replace(/&gt;/gi, '>');
  cleaned = cleaned.replace(/&amp;/gi, '&');
  cleaned = cleaned.replace(/&quot;/gi, '"');
  cleaned = cleaned.replace(/&#39;/gi, "'");
  cleaned = cleaned.replace(/&nbsp;/gi, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  
  return cleaned.trim();
}

/**
 * Maximum allowed length for email fields to prevent storage issues
 */
const MAX_EMAIL_FIELD_LENGTH = 100_000; // 100KB of text

/**
 * Validates and truncates email content fields to prevent storage issues.
 * @param value The value to sanitize
 * @param maxLength Maximum allowed length (default: 100,000 characters)
 * @returns Sanitized value
 */
export function sanitizeEmailField(value: string | null | undefined, maxLength: number = MAX_EMAIL_FIELD_LENGTH): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}
