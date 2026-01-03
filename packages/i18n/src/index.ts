import en from './locales/en.js'
import sv from './locales/sv.js'

type LocaleKey = 'en' | 'sv'

interface LocaleMap {
  [key: string]: string | LocaleMap
}

type TranslationValue = string | LocaleMap

const LOCALES: Record<LocaleKey, LocaleMap> = {
  en,
  sv,
}

let currentLang: LocaleKey = detectLanguage()

function detectLanguage(): LocaleKey {
  let lang: string | undefined

  const maybeNavigator = (globalThis as { navigator?: { language?: string } }).navigator
  if (maybeNavigator && typeof maybeNavigator.language === 'string') {
    lang = maybeNavigator.language
  } else {
    const langEnv =
      typeof process !== 'undefined' &&
      typeof process.env === 'object' &&
      typeof process.env['LANG'] === 'string'
        ? process.env['LANG']
        : undefined
    lang = langEnv
  }

  return normalizeLang(lang)
}

function normalizeLang(lang?: string): LocaleKey {
  const code = lang?.slice(0, 2).toLowerCase()
  if (code === 'sv') return 'sv'
  return 'en'
}

function lookup(locale: LocaleMap, path: string): string | undefined {
  const parts = path.split('.')
  let node: TranslationValue | undefined = locale

  for (const part of parts) {
    if (node && typeof node === 'object' && part in node) {
      node = (node as Record<string, TranslationValue>)[part]
    } else {
      return undefined
    }
  }

  return typeof node === 'string' ? node : undefined
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key]
    return value === undefined ? _match : String(value)
  })
}

function translate(lang: LocaleKey, path: string, vars?: Record<string, string | number>): string {
  const primary = lookup(LOCALES[lang], path)
  const fallback = lang === 'en' ? undefined : lookup(LOCALES.en, path)
  const resolved = primary ?? fallback ?? path
  if (typeof resolved !== 'string') {
    return String(resolved ?? path)
  }
  return interpolate(resolved, vars)
}

export interface Translator {
  lang: LocaleKey
  t: (path: string, vars?: Record<string, string | number>) => string
}

export function createTranslator(lang?: string): Translator {
  const resolvedLang = normalizeLang(lang ?? detectLanguage())
  return {
    lang: resolvedLang,
    t: (path: string, vars?: Record<string, string | number>) =>
      translate(resolvedLang, path, vars),
  }
}

export function initI18n(lang?: string): void {
  currentLang = normalizeLang(lang ?? detectLanguage())
}

export function setLang(lang: string): void {
  currentLang = normalizeLang(lang)
}

export function getLang(): LocaleKey {
  return currentLang
}

export function t(path: string, vars?: Record<string, string | number>): string {
  return translate(currentLang, path, vars)
}

// Initialize once on import so consumers get a default language without manual setup.
initI18n()
