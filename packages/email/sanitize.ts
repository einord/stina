/**
 * Normalizes email body content from text or HTML.
 * Strips scripts, styles, and excessive whitespace.
 * Note: This is not intended for browser rendering - output is only shown to LLM.
 * @param text Plain text email body
 * @param html HTML email body
 * @returns Normalized text content
 */
export function normalizeEmailBody(text?: string | null, html?: string | null): string {
  if (text && text.trim()) return text.trim();
  if (!html) return '';
  let cleaned = html;
  // Remove script and style tags more robustly (handle spaces in closing tags)
  // Multiple passes to handle nested or malformed tags
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
    cleaned = cleaned.replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  }
  // Remove any remaining script or style tags (even if unclosed)
  cleaned = cleaned.replace(/<script[^>]*>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>/gi, '');
  // Convert common block elements to newlines
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/(p|div|section|article|tr|td|li)>/gi, '\n');
  cleaned = cleaned.replace(/<li[^>]*>/gi, '- ');
  // Strip all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  // Normalize whitespace
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
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
