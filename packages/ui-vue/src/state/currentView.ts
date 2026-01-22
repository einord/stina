/**
 * Global state for the current view.
 * This is used by NotificationService to determine if notifications should be shown.
 */

let currentView: 'chat' | 'tools' | 'settings' = 'chat'

/**
 * Get the current view
 */
export function getCurrentView(): 'chat' | 'tools' | 'settings' {
  return currentView
}

/**
 * Set the current view
 */
export function setCurrentView(view: 'chat' | 'tools' | 'settings'): void {
  currentView = view
}
