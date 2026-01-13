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
  app.component(
    'ExtensionLabel',
    defineAsyncComponent(() => import('./components/extension-components/Label.vue'))
  )
  app.component(
    'ExtensionParagraph',
    defineAsyncComponent(() => import('./components/extension-components/Paragraph.vue'))
  )
  app.component(
    'ExtensionButton',
    defineAsyncComponent(() => import('./components/extension-components/Button.vue'))
  )
  app.component(
    'ExtensionTextInput',
    defineAsyncComponent(() => import('./components/extension-components/TextInput.vue'))
  )
  app.component(
    'ExtensionToggle',
    defineAsyncComponent(() => import('./components/extension-components/Toggle.vue'))
  )
  app.component(
    'ExtensionSelect',
    defineAsyncComponent(() => import('./components/extension-components/Select.vue'))
  )
  app.component(
    'ExtensionVerticalStack',
    defineAsyncComponent(() => import('./components/extension-components/VerticalStack.vue'))
  )
  app.component(
    'ExtensionHorizontalStack',
    defineAsyncComponent(() => import('./components/extension-components/HorizontalStack.vue'))
  )
  app.component(
    'ExtensionGrid',
    defineAsyncComponent(() => import('./components/extension-components/Grid.vue'))
  )
  app.component(
    'ExtensionDivider',
    defineAsyncComponent(() => import('./components/extension-components/Divider.vue'))
  )
  app.component(
    'ExtensionIcon',
    defineAsyncComponent(() => import('./components/extension-components/Icon.vue'))
  )
  app.component(
    'ExtensionIconButton',
    defineAsyncComponent(() => import('./components/extension-components/IconButton.vue'))
  )
  app.component(
    'ExtensionPanel',
    defineAsyncComponent(() => import('./components/extension-components/Panel.vue'))
  )
}
