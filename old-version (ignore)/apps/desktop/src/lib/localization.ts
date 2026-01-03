import { getLang } from '@stina/i18n';
import { computed, ref } from 'vue';

const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const timeZoneRef = ref<string>(systemTimeZone);

/**
 * Initializes the renderer timezone state from persisted settings.
 * Should be called once at app startup before mounting.
 */
export async function initRendererLocalization(): Promise<void> {
  try {
    const saved = await window.stina.settings.getTimeZone();
    timeZoneRef.value = saved?.trim() ? saved.trim() : systemTimeZone;
  } catch {
    timeZoneRef.value = systemTimeZone;
  }
}

/**
 * Updates the renderer timezone state after the user changes it in settings.
 */
export function setRendererTimeZoneOverride(timeZone: string | null): void {
  timeZoneRef.value = timeZone?.trim() ? timeZone.trim() : systemTimeZone;
}

/**
 * Reactive accessor for the current effective timezone used for UI formatting.
 */
export function useTimeZone() {
  return computed(() => timeZoneRef.value);
}

/**
 * Returns a stable locale string for date/time formatting that matches the selected UI language.
 * Note: language changes trigger a full reload, so this does not need to be reactive.
 */
export function getLocaleForFormatting(): string {
  const lang = getLang();
  if (lang === 'sv') return 'sv-SE';
  if (lang === 'en') return 'en-US';
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en-US';
}

// Lazy init when first imported by the renderer bundle.
if (typeof window !== 'undefined') {
  void initRendererLocalization();
}
