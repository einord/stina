/**
 * Semantic notification sound identifiers.
 * These are mapped to OS-specific sounds on each platform.
 */
export type NotificationSoundId =
  | 'default' // OS default notification sound
  | 'subtle' // Gentle, non-intrusive sound
  | 'standard' // Normal notification sound
  | 'attention' // More prominent, attention-grabbing
  | 'success' // Positive feedback sound
  | 'error' // Error/warning sound
  | 'none' // Silent notification

/**
 * Options for displaying a notification
 */
export interface NotificationOptions {
  /** Title of the notification */
  title: string
  /** Body text of the notification */
  body: string
  /** Sound identifier to play (or 'none' for silent) */
  sound?: NotificationSoundId
  /** Action to take when notification is clicked */
  clickAction?: 'focus-chat' | 'none'
}

/**
 * Context information for determining whether to show a notification
 */
export interface NotificationContext {
  /** Whether the application window is focused */
  isWindowFocused: boolean
  /** The current view the user is on */
  currentView: 'chat' | 'tools' | 'settings'
}

/**
 * Result of attempting to show a notification
 */
export interface NotificationResult {
  /** Whether the notification was shown */
  shown: boolean
  /** Reason why the notification was not shown (if applicable) */
  reason?: 'permission-denied' | 'window-focused' | 'disabled' | 'empty-content' | 'error'
}
