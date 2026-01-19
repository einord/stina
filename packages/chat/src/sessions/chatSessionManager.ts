import { nanoid } from 'nanoid'
import type { AppSettingsDTO } from '@stina/shared'
import { APP_NAMESPACE } from '@stina/core'
import type { SettingsStore } from '@stina/core'
import type { ChatOrchestrator } from '../orchestrator/ChatOrchestrator.js'
import { getAppSettingsStore, onAppSettingsUpdated } from '../db/appSettingsStore.js'

export interface ChatSession {
  id: string
  orchestrator: ChatOrchestrator
  conversationId?: string
  lastUsedAt: number
}

export interface ChatSessionManagerOptions {
  subscribeToSettings?: boolean
}

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>()
  private conversationToSession = new Map<string, string>()
  private settingsUnsubscribe?: () => void
  private lastPromptSignature: string | null = null

  constructor(
    private createOrchestrator: () => ChatOrchestrator,
    options: ChatSessionManagerOptions = {}
  ) {
    const settingsStore = getAppSettingsStore()
    if (settingsStore) {
      const signature = getPromptSignatureFromStore(settingsStore)
      if (signature) {
        this.lastPromptSignature = signature
      }
    }

    if (options.subscribeToSettings !== false) {
      this.settingsUnsubscribe = onAppSettingsUpdated((settings) => {
        this.handleSettingsUpdate(settings)
      })
    }
  }

  getSession(params: { sessionId?: string; conversationId?: string }): ChatSession {
    const existing = this.findSession(params)
    if (existing) return existing

    const { sessionId, conversationId } = params
    const id = sessionId ?? conversationId ?? nanoid()
    const orchestrator = this.createOrchestrator()
    const session: ChatSession = {
      id,
      orchestrator,
      conversationId,
      lastUsedAt: Date.now(),
    }

    this.sessions.set(id, session)
    if (conversationId) {
      this.conversationToSession.set(conversationId, id)
    }

    return session
  }

  findSession(params: { sessionId?: string; conversationId?: string }): ChatSession | null {
    const { sessionId, conversationId } = params

    if (sessionId) {
      const existing = this.sessions.get(sessionId)
      if (existing) {
        existing.lastUsedAt = Date.now()
        return existing
      }
    }

    if (conversationId) {
      const mappedSessionId = this.conversationToSession.get(conversationId)
      if (mappedSessionId) {
        const existing = this.sessions.get(mappedSessionId)
        if (existing) {
          existing.lastUsedAt = Date.now()
          return existing
        }
      }
    }

    return null
  }

  registerConversation(sessionId: string, conversationId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.conversationId = conversationId
    this.conversationToSession.set(conversationId, sessionId)
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.conversationId) {
      this.conversationToSession.delete(session.conversationId)
    }
    this.sessions.delete(sessionId)
  }

  /**
   * Disposes the session manager and cleans up settings subscription.
   */
  dispose(): void {
    this.settingsUnsubscribe?.()
    this.settingsUnsubscribe = undefined
  }

  /**
   * Destroys all sessions and cleans up the manager.
   * Used when user settings change and sessions need to be recreated.
   */
  destroyAllSessions(): void {
    for (const session of this.sessions.values()) {
      session.orchestrator.destroy()
    }
    this.sessions.clear()
    this.conversationToSession.clear()
    this.dispose()
  }

  private handleSettingsUpdate(settings: AppSettingsDTO): void {
    const signature = getPromptSignature(settings)
    if (signature === this.lastPromptSignature) return
    this.lastPromptSignature = signature
    this.broadcastSettingsUpdate()
  }

  private broadcastSettingsUpdate(): void {
    for (const session of this.sessions.values()) {
      void session.orchestrator.enqueueMessage('', 'instruction', undefined, 'settings-update')
    }
  }
}

type PromptSignatureSettings = Pick<
  AppSettingsDTO,
  'language' | 'firstName' | 'nickname' | 'personalityPreset' | 'customPersonalityPrompt'
>

function getPromptSignature(settings: PromptSignatureSettings): string {
  const language = normalizeValue(settings.language)
  const firstName = normalizeValue(settings.firstName)
  const nickname = normalizeValue(settings.nickname)
  const personalityPreset = normalizeValue(settings.personalityPreset)
  const customPrompt =
    personalityPreset === 'custom' ? normalizeValue(settings.customPersonalityPrompt) : ''

  return JSON.stringify({
    language,
    firstName,
    nickname,
    personalityPreset,
    customPrompt,
  })
}

function normalizeValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function getPromptSignatureFromStore(settingsStore: SettingsStore): string | null {
  const language = settingsStore.get<string>(APP_NAMESPACE, 'language')
  const firstName = settingsStore.get<string>(APP_NAMESPACE, 'firstName')
  const nickname = settingsStore.get<string>(APP_NAMESPACE, 'nickname')
  const personalityPreset = settingsStore.get<string>(APP_NAMESPACE, 'personalityPreset')
  const customPersonalityPrompt = settingsStore.get<string>(
    APP_NAMESPACE,
    'customPersonalityPrompt'
  )

  if (typeof language !== 'string' || typeof personalityPreset !== 'string') {
    return null
  }

  return getPromptSignature({
    language: language as AppSettingsDTO['language'],
    firstName,
    nickname,
    personalityPreset,
    customPersonalityPrompt,
  })
}
