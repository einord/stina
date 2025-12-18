export type SettingsNavigationTarget = {
  group?: 'ai' | 'localization' | 'email' | 'interface' | 'profile' | 'work' | 'advanced' | 'notifications';
  recurringTemplateId?: string | null;
};

export const SETTINGS_NAV_EVENT = 'stina:navigate-settings';

/**
 * Emit a navigation request that asks the app shell to switch to the Settings view.
 * @param target Which settings group to show and any specific deep-link data (e.g. recurring template id).
 */
export function emitSettingsNavigation(target: SettingsNavigationTarget) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SettingsNavigationTarget>(SETTINGS_NAV_EVENT, { detail: target }));
}

/**
 * Listen for settings navigation events from nested components.
 * Returns a disposer that removes the listener when called.
 * @param handler Callback invoked when a navigation event fires.
 */
export function onSettingsNavigation(handler: (target: SettingsNavigationTarget) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const listener = (event: Event) => {
    const custom = event as CustomEvent<SettingsNavigationTarget>;
    handler(custom.detail ?? {});
  };

  window.addEventListener(SETTINGS_NAV_EVENT, listener as EventListener);
  return () => window.removeEventListener(SETTINGS_NAV_EVENT, listener as EventListener);
}
