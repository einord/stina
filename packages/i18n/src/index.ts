import en from './locales/en.json';
import sv from './locales/sv.json';

type LocaleMap = Record<string, unknown>;

const LOCALES: Record<string, LocaleMap> = {
  en,
  sv,
};

let current: LocaleMap = LOCALES.en;
let currentLang = 'en';

export function initI18n(lang?: string) {
  const k = (lang || process.env.LANG || 'en').slice(0, 2);
  if (LOCALES[k]) {
    current = LOCALES[k];
    currentLang = k;
  } else {
    current = LOCALES.en;
    currentLang = 'en';
  }
}

export function getLang() {
  return currentLang;
}

export function t(path: string, vars?: Record<string, string | number>): string {
  const parts = path.split('.');
  let node: unknown = current;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>))
      node = (node as Record<string, unknown>)[p];
    else {
      // fallback to en
      const fallbackParts = path.split('.');
      node = en as unknown;
      for (const fp of fallbackParts) {
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

export default { initI18n, t, getLang };
