import type { App } from 'vue'
import { inject } from 'vue'
import { initI18n as baseInit, t as baseT, setLang as baseSetLang, getLang as baseGetLang } from '@stina/i18n'

export interface I18nContext {
  t: typeof baseT
  setLang: typeof baseSetLang
  getLang: typeof baseGetLang
}

export const i18nKey = Symbol('i18n') as symbol

/**
 * Provide i18n for Vue apps (web and electron renderer).
 * Initializes the language once per app and exposes helpers via injection.
 */
export function provideI18n(app: App, lang?: string): I18nContext {
  baseInit(lang)
  const ctx: I18nContext = {
    t: baseT,
    setLang: baseSetLang,
    getLang: baseGetLang,
  }
  app.provide(i18nKey, ctx)
  return ctx
}

export function useI18n(): I18nContext {
  const ctx = inject<I18nContext>(i18nKey)
  if (!ctx) {
    throw new Error('I18n not provided. Call provideI18n() in app setup.')
  }
  return ctx
}

// Convenience re-exports for templates or composition functions
export const t = baseT
export const initI18n = baseInit
export const setLang = baseSetLang
export const getLang = baseGetLang
