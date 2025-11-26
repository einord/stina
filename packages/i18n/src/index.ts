import en from './locales/en.js';
import sv from './locales/sv.js';

type LocaleMap = Record<string, unknown>;

const LOCALES: Record<string, LocaleMap> = {
  en,
  sv,
};

let current: LocaleMap = LOCALES.en;
let currentLang = 'en';

/**
 * Initializes the i18n system with the specified or automatically detected language.
 * Call this at app startup to set the correct language for the UI and AI prompts.
 * @param lang Optional language code (e.g., 'en', 'sv'). If not provided, will detect from environment.
 */
export function initI18n(lang?: string) {
  // Determine preferred language in a cross-environment way (browser/electron/node)
  let preferred: string | undefined = lang;
  if (!preferred && typeof navigator !== 'undefined') {
    preferred = navigator.language;
  }
  // Access process.env.LANG defensively without using 'any'
  if (!preferred && typeof process !== 'undefined' && typeof process.env === 'object') {
    const langEnv = process.env.LANG;
    if (typeof langEnv === 'string' && langEnv.length > 0) {
      preferred = langEnv;
    }
  }
  const k = (preferred || 'en').slice(0, 2).toLowerCase();
  if (LOCALES[k]) {
    current = LOCALES[k];
    currentLang = k;
  } else {
    current = LOCALES.en;
    currentLang = 'en';
  }
}

/**
 * Gets the current active language code.
 * @returns The current language code (e.g., 'en', 'sv').
 */
export function getLang() {
  return currentLang;
}

/**
 * Changes the active language at runtime.
 * Call this when the user changes their language preference in settings.
 * @param lang The language code to switch to (e.g., 'en', 'sv').
 */
export function setLang(lang: string) {
  const k = lang.slice(0, 2).toLowerCase();
  if (LOCALES[k]) {
    current = LOCALES[k];
    currentLang = k;
  } else {
    current = LOCALES.en;
    currentLang = 'en';
  }
}

export function t(path: string, vars?: Record<string, string | number>): string {
  const parts = path.split('.');
  let node: unknown = current;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>))
      node = (node as Record<string, unknown>)[p];
    else {
      // fallback to en
      node = LOCALES.en as unknown;
      for (const fp of parts) {
        if (node && typeof node === 'object' && fp in (node as Record<string, unknown>))
          node = (node as Record<string, unknown>)[fp];
        else {
          node = path; // last resort: return key
          break;
        }
      }
      break;
    }
  }

  if (typeof node !== 'string') return String(node ?? '');

  let out = node as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v));
    }
  }
  return out;
}

// initialize default language once
initI18n();

export { formatRelativeTime } from './relativeTime';
export default { initI18n, t, getLang, setLang };
