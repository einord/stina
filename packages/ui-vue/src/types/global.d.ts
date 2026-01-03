import type { ComponentCustomProperties } from 'vue'
import { t as i18nT, setLang as i18nSetLang, getLang as i18nGetLang } from '@stina/i18n'

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: typeof i18nT
    $setLang: typeof i18nSetLang
    $getLang: typeof i18nGetLang
  }
}

export {}
