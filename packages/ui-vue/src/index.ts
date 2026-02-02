// Components
export { default as AppShell } from './components/AppShell.vue'
export { default as Icon } from './components/common/Icon.vue'
export { default as CodeBlock } from './components/common/CodeBlock.vue'
export { default as DataGrid, type DataGridColumn } from './components/common/DataGrid.vue'
export { default as ToolCallBadge } from './components/common/ToolCallBadge.vue'
export { default as UserMenu } from './components/UserMenu.vue'

// Auth Components
export { default as SetupView } from './components/auth/SetupView.vue'
export { default as LoginView } from './components/auth/LoginView.vue'
export { default as ElectronLoginView } from './components/auth/ElectronLoginView.vue'
export { default as RegisterView } from './components/auth/RegisterView.vue'
export { default as PasskeyButton } from './components/auth/PasskeyButton.vue'

// Onboarding
export { default as OnboardingView } from './components/onboarding/OnboardingView.vue'
export { default as ConnectionSetupView } from './components/onboarding/ConnectionSetupView.vue'
export { default as ConnectionModeStep } from './components/onboarding/steps/ConnectionModeStep.vue'
export type { OnboardingMode } from './components/onboarding/composables/useOnboarding.js'


// Theme
export { applyTheme } from './theme/applyTheme.js'
export { createThemeController } from './theme/themeController.js'

// App Info
export {
  useApp,
  tryUseApp,
  provideAppInfo,
  appInfoKey,
  type AppInfo,
  type AppType,
} from './composables/useApp.js'

// API Client
export { useApi, apiClientKey } from './composables/useApi.js'
export type {
  ApiClient,
  ExtensionSettingsResponse,
  ExtensionEvent,
  ChatEvent,
  ProviderInfo,
  PanelViewInfo,
  ToolSettingsViewInfo,
  ActionInfo,
  ExtensionToolInfo,
  ChatStreamEvent,
  ChatStreamOptions,
} from './composables/useApi.js'

// Extension Actions
export { useExtensionActions } from './composables/useExtensionActions.js'

// Notifications
export {
  useNotifications,
  tryUseNotifications,
  notificationServiceKey,
} from './composables/useNotifications.js'
export { NotificationService, type NotificationAdapter, type SoundSupportInfo } from './services/NotificationService.js'
export { getCurrentView, setCurrentView } from './state/currentView.js'

// Auth
export {
  useAuth,
  createAuth,
  createLocalAuth,
  provideAuth,
  authKey,
  type UseAuthReturn,
} from './composables/useAuth.js'

// Auth types
export type {
  User,
  TokenPair,
  AuthState,
  DeviceInfo,
  Invitation,
  SetupStatus,
  RegistrationOptionsResponse,
  AuthResponse,
  InvitationValidation,
} from './types/auth.js'

// Extension Context (for action execution within extensions)
export {
  useExtensionContext,
  tryUseExtensionContext,
  provideExtensionContext,
  type ExtensionContext,
} from './composables/useExtensionContext.js'

// i18n
export {
  useI18n,
  provideI18n,
  t,
  initI18n as initI18nVue,
  setLang as setLangVue,
  getLang as getLangVue,
} from './composables/useI18n.js'

// Extension scope
export {
  useExtensionScope,
  provideExtensionScope,
  resolveValue,
  resolveComponentProps,
  isIterator,
  type ExtensionScope,
} from './composables/useExtensionScope.js'
export { default as ExtensionScopeProvider } from './components/extension-components/ExtensionScopeProvider.vue'
export { default as ExtensionComponent } from './components/extension-components/ExtensionComponent.vue'
export { default as ExtensionChildren } from './components/extension-components/ExtensionChildren.vue'

// Plugin for global component registration
export { installUi } from './plugin.js'

// Re-export ThemeTokens from core for convenience
export type { ThemeTokens, ThemeTokenName, ThemeTokenMeta } from '@stina/core'

// Re-export extension types for convenience
export type {
  RegistryEntry,
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstalledExtensionInfo,
  InstallResult,
  ExtensionCategory,
  VersionInfo,
} from '@stina/extension-installer'
