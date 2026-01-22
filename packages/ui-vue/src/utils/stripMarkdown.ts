/**
 * Strip markdown formatting from text for use in notifications.
 * Converts markdown to plain text, truncating to a reasonable length.
 *
 * @param text - The markdown text to strip
 * @returns Plain text suitable for notification body
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Replace code blocks with [code]
      .replace(/```[\s\S]*?```/g, '[code]')
      // Replace inline code with [code]
      .replace(/`[^`]+`/g, '[code]')
      // Remove headers (# syntax)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold (**text**)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // Remove italic (*text*)
      .replace(/\*([^*]+)\*/g, '$1')
      // Remove bold (__text__)
      .replace(/__([^_]+)__/g, '$1')
      // Remove italic (_text_)
      .replace(/_([^_]+)_/g, '$1')
      // Convert links [text](url) to just text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Convert unordered lists to bullet points
      .replace(/^[\s]*[-*+]\s+/gm, '• ')
      // Remove numbered list prefixes
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      // Truncate to reasonable notification length
      .substring(0, 200)
  )
}
