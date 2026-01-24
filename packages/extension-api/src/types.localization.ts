/**
 * Localization Types
 *
 * Types and utilities for localized strings in extensions.
 */

/**
 * A string that can be either a simple string or a map of language codes to localized strings.
 * When a simple string is provided, it's used as the default/fallback value.
 * When a map is provided, the appropriate language is selected at runtime.
 *
 * @example
 * // Simple string (backwards compatible)
 * name: "Get Weather"
 *
 * @example
 * // Localized strings
 * name: { en: "Get Weather", sv: "Hämta väder", de: "Wetter abrufen" }
 */
export type LocalizedString = string | Record<string, string>

/**
 * Resolves a LocalizedString to an actual string value.
 * @param value The LocalizedString to resolve
 * @param lang The preferred language code (e.g., "sv", "en")
 * @param fallbackLang The fallback language code (defaults to "en")
 * @returns The resolved string value
 */
export function resolveLocalizedString(
  value: LocalizedString,
  lang: string,
  fallbackLang = 'en'
): string {
  if (typeof value === 'string') {
    return value
  }
  // Try preferred language first, then fallback language, then first available, then empty string
  return value[lang] ?? value[fallbackLang] ?? Object.values(value)[0] ?? ''
}
