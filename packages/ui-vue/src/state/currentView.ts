/**
 * Global state for the current view.
 * This is used by NotificationService to determine if notifications should be shown.
 */

type CurrentView = 'chat' | 'inbox' | 'activity' | 'policies' | 'tools' | 'settings'

let currentView: CurrentView = 'chat'

/**
 * Get the current view
 */
export function getCurrentView(): CurrentView {
  return currentView
}

/**
 * Set the current view
 */
export function setCurrentView(view: CurrentView): void {
  currentView = view
}
