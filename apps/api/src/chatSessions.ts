import { randomUUID } from 'node:crypto'
import type { ChatOrchestrator } from '@stina/chat/orchestrator'

export interface ChatSession {
  id: string
  orchestrator: ChatOrchestrator
  conversationId?: string
  lastUsedAt: number
}

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>()
  private conversationToSession = new Map<string, string>()

  constructor(private createOrchestrator: () => ChatOrchestrator) {}

  getSession(params: { sessionId?: string; conversationId?: string }): ChatSession {
    const existing = this.findSession(params)
    if (existing) return existing

    const { sessionId, conversationId } = params
    const id = sessionId ?? conversationId ?? randomUUID()
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
}
