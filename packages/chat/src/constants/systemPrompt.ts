import { createTranslator, getLang } from '@stina/i18n'
import { APP_NAMESPACE, extensionRegistry } from '@stina/core'
import type {
  SettingsStore,
  ExtensionPromptContribution,
  ExtensionPromptSection,
} from '@stina/core'
import { STINA_NO_REPLY } from './messageTypes.js'

type PromptSection = ExtensionPromptSection

interface PromptChunk {
  section: PromptSection
  order: number
  text: string
}

const SECTION_ORDER: Record<PromptSection, number> = {
  system: 0,
  behavior: 10,
  tools: 20,
}

interface PromptContext {
  lang: string
  t: (path: string, vars?: Record<string, string | number>) => string
  name: string
  nickName: string
}

function getPromptContext(settingsStore?: SettingsStore): PromptContext {
  const languageSetting = settingsStore?.get<string>(APP_NAMESPACE, 'language')
  const lang = typeof languageSetting === 'string' ? languageSetting : getLang()
  const { t } = createTranslator(lang)
  const { name, nickName } = getUserNameForPrompt(settingsStore, t)

  return { lang, t, name, nickName }
}

/**
 * Get system prompt in user's language
 * Uses i18n to translate the prompt based on current language setting
 * Can be overridden via Settings (app.systemPrompt)
 *
 * @param settingsStore - Optional settings store to check for user override
 * @returns System prompt in user's language
 */
export function getSystemPrompt(settingsStore?: SettingsStore): string {
  const override = settingsStore?.get<string>(APP_NAMESPACE, 'systemPrompt')

  // Check for user override in settings
  if (typeof override === 'string' && override.trim()) {
    return override
  }

  const { t, name, nickName, lang } = getPromptContext(settingsStore)

  const chunks: PromptChunk[] = []

  pushChunk(chunks, {
    section: 'system',
    order: 0,
    text: t('chat.system_prompt.base', {
      name,
      nickName,
      no_reply_marker: STINA_NO_REPLY,
    }),
  })

  pushChunk(chunks, {
    section: 'system',
    order: 10,
    text: t('chat.system_prompt.purpose'),
  })

  const personalityPrompt = getPersonalityPrompt(settingsStore, t)
  if (personalityPrompt) {
    pushChunk(chunks, {
      section: 'behavior',
      order: 0,
      text: personalityPrompt,
    })
  }

  pushChunk(chunks, {
    section: 'tools',
    order: 0,
    text: t('chat.system_prompt.tools'),
  })

  chunks.push(...getExtensionPromptChunks(lang))

  const sorted = chunks
    .filter((chunk) => chunk.text.trim().length > 0)
    .sort((a, b) => {
      const sectionDiff = SECTION_ORDER[a.section] - SECTION_ORDER[b.section]
      if (sectionDiff !== 0) return sectionDiff
      return a.order - b.order
    })

  return sorted.map((chunk) => chunk.text.trim()).join('\n\n')
}

/**
 * Get the instruction used to trigger the initial greeting.
 */
export function getGreetingInstruction(settingsStore?: SettingsStore): string {
  const { t, name } = getPromptContext(settingsStore)
  return t('chat.system_prompt.greeting', { name })
}

/**
 * Prefix shown when updated instructions are introduced.
 */
export function getPromptUpdatePrefix(settingsStore?: SettingsStore): string {
  const { t } = getPromptContext(settingsStore)
  return t('chat.system_prompt.updated_prefix')
}

/**
 * Info message shown when instructions are updated.
 */
export function getPromptUpdateInfo(settingsStore?: SettingsStore): string {
  const { t } = getPromptContext(settingsStore)
  return t('chat.system_prompt.updated_info')
}

/**
 * Instruction sent to the model to acknowledge updated instructions.
 */
export function getPromptUpdateInstruction(settingsStore?: SettingsStore): string {
  const { t } = getPromptContext(settingsStore)
  return t('chat.system_prompt.updated_instruction')
}

/**
 * Add a prompt chunk if it has meaningful content.
 */
function pushChunk(target: PromptChunk[], chunk: PromptChunk): void {
  if (!chunk.text || !chunk.text.trim()) return
  target.push(chunk)
}

/**
 * Resolve the personality prompt based on app settings.
 * Returns null when no personality chunk should be added.
 */
function getPersonalityPrompt(
  settingsStore: SettingsStore | undefined,
  t: (path: string, vars?: Record<string, string | number>) => string
): string | null {
  const presetValue = settingsStore?.get<string>(APP_NAMESPACE, 'personalityPreset')
  const preset =
    presetValue === 'friendly' ||
    presetValue === 'concise' ||
    presetValue === 'sarcastic' ||
    presetValue === 'professional' ||
    presetValue === 'informative' ||
    presetValue === 'creative' ||
    presetValue === 'custom'
      ? presetValue
      : 'friendly'
  const customPrompt = settingsStore?.get<string>(APP_NAMESPACE, 'customPersonalityPrompt')

  if (preset === 'custom') {
    const trimmed = typeof customPrompt === 'string' ? customPrompt.trim() : ''
    return trimmed.length > 0 ? trimmed : null
  }

  const key = `chat.system_prompt.personality.${preset}`
  const value = t(key)
  return value === key ? null : value
}

/**
 * Collect prompt contributions from extensions and normalize them into chunks.
 */
function getExtensionPromptChunks(lang: string): PromptChunk[] {
  const contributions = extensionRegistry.getPromptContributions()
  if (contributions.length === 0) return []

  return contributions
    .map(({ prompt }) => {
      const text = resolvePromptText(prompt, lang)
      if (!text) return null
      return {
        section: prompt.section ?? 'tools',
        order: prompt.order ?? 100,
        text: formatPromptText(prompt, text),
      }
    })
    .filter((chunk): chunk is PromptChunk => chunk !== null)
}

/**
 * Resolve prompt text from i18n or fallback text.
 */
function resolvePromptText(prompt: ExtensionPromptContribution, lang: string): string {
  if (prompt.i18n) {
    const localized = prompt.i18n[lang] ?? prompt.i18n['en']
    if (localized && localized.trim()) return localized
  }
  return prompt.text?.trim() ?? ''
}

/**
 * Format a prompt contribution, optionally prefixed with a title.
 */
function formatPromptText(prompt: ExtensionPromptContribution, text: string): string {
  if (!prompt.title) return text
  return `${prompt.title}\n${text}`
}

/**
 * Build display names for prompt interpolation based on user profile settings.
 */
function getUserNameForPrompt(
  settingsStore: SettingsStore | undefined,
  t: (path: string, vars?: Record<string, string | number>) => string
): { name: string; nickName: string } {
  const rawFirstName = settingsStore?.get<string>(APP_NAMESPACE, 'firstName')
  const rawNickname = settingsStore?.get<string>(APP_NAMESPACE, 'nickname')
  const firstName = typeof rawFirstName === 'string' ? rawFirstName.trim() : ''
  const nickname = typeof rawNickname === 'string' ? rawNickname.trim() : ''
  const fallback = t('chat.system_prompt.user_fallback')

  const name = firstName
    ? nickname
      ? `${firstName} (${nickname})`
      : firstName
    : nickname || fallback
  const nickName = nickname || firstName || fallback

  return { name, nickName }
}
