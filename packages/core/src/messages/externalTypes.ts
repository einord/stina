/**
 * Placeholder type aliases for shapes that live in `packages/chat`'s existing
 * message types. The redesign reuses these; they are not redefined here.
 *
 * Implementation note: the concrete shapes are in `packages/chat/src/types/`
 * (and re-exported from `@stina/chat`). `packages/core` cannot depend on
 * `@stina/chat` (that would invert the layer rule from AGENTS.md), so we
 * declare them as opaque aliases here. Consumers that need the concrete
 * shape import from `@stina/chat` directly.
 */

/** Reused from `@stina/chat`. Concrete shape lives there. */
export type Attachment = unknown

/** Reused from `@stina/chat`. Concrete shape lives there. */
export type ToolCall = unknown

/** Reused from `@stina/chat`. Concrete shape lives there. */
export type ToolResult = unknown
