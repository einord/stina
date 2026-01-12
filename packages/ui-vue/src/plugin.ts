import { defineAsyncComponent, type App } from 'vue'
import Icon from './components/common/Icon.vue'
import {
  t as i18nT,
  setLang as i18nSetLang,
  getLang as i18nGetLang,
} from './composables/useI18n.js'

/**
 * Register common UI components globally (e.g., Icon).
 * Usage: installUi(app) in your app entrypoint.
 */
export function installUi(app: App): void {
  app.component('Icon', Icon)
  // Global i18n helpers for templates without imports
  app.config.globalProperties['$t'] = i18nT
  app.config.globalProperties['$setLang'] = i18nSetLang
  app.config.globalProperties['$getLang'] = i18nGetLang

  // Extension components
  app.component(
    'ExtensionHeader',
    defineAsyncComponent(() => import('./components/extension-components/Header.vue'))
  )
}
