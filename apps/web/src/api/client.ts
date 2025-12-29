import type {
  Greeting,
  ThemeSummary,
  ExtensionSummary,
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
} from '@stina/shared'
import type {
  ThemeTokens,
  ApiClient,
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstallResult,
} from '@stina/ui-vue'

const API_BASE = '/api'

/**
 * HTTP-based API client for the web app
 */
export function createHttpApiClient(): ApiClient {
  return {
    async getGreeting(name?: string): Promise<Greeting> {
      const url = name ? `${API_BASE}/hello?name=${encodeURIComponent(name)}` : `${API_BASE}/hello`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch greeting: ${response.statusText}`)
      }

      return response.json()
    },

    async getThemes(): Promise<ThemeSummary[]> {
      const response = await fetch(`${API_BASE}/themes`)

      if (!response.ok) {
        throw new Error(`Failed to fetch themes: ${response.statusText}`)
      }

      return response.json()
    },

    async getThemeTokens(id: string): Promise<ThemeTokens> {
      const response = await fetch(`${API_BASE}/themes/${encodeURIComponent(id)}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch theme: ${response.statusText}`)
      }

      return response.json()
    },

    async getExtensions(): Promise<ExtensionSummary[]> {
      const response = await fetch(`${API_BASE}/extensions`)

      if (!response.ok) {
        throw new Error(`Failed to fetch extensions: ${response.statusText}`)
      }

      return response.json()
    },

    async health(): Promise<{ ok: boolean }> {
      const response = await fetch(`${API_BASE}/health`)

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`)
      }

      return response.json()
    },

    // No-op in web; Electron implements for dev theme reloads
    async reloadThemes(): Promise<void> {
      return
    },

    chat: {
      async listConversations(): Promise<ChatConversationSummaryDTO[]> {
        const response = await fetch(`${API_BASE}/chat/conversations`)

        if (!response.ok) {
          throw new Error(`Failed to fetch conversations: ${response.statusText}`)
        }

        return response.json()
      },

      async getConversation(id: string): Promise<ChatConversationDTO> {
        const response = await fetch(`${API_BASE}/chat/conversations/${encodeURIComponent(id)}`)

        if (!response.ok) {
          throw new Error(`Failed to fetch conversation: ${response.statusText}`)
        }

        return response.json()
      },

      async getLatestActiveConversation(): Promise<ChatConversationDTO | null> {
        const response = await fetch(`${API_BASE}/chat/conversations/latest`)

        if (!response.ok) {
          throw new Error(`Failed to fetch latest conversation: ${response.statusText}`)
        }

        return response.json()
      },

      async getConversationInteractions(
        conversationId: string,
        limit: number,
        offset: number
      ): Promise<ChatInteractionDTO[]> {
        const url = `${API_BASE}/chat/conversations/${encodeURIComponent(conversationId)}/interactions?limit=${limit}&offset=${offset}`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`Failed to fetch interactions: ${response.statusText}`)
        }

        return response.json()
      },

      async countConversationInteractions(conversationId: string): Promise<number> {
        const response = await fetch(
          `${API_BASE}/chat/conversations/${encodeURIComponent(conversationId)}/interactions/count`
        )

        if (!response.ok) {
          throw new Error(`Failed to count interactions: ${response.statusText}`)
        }

        const data = await response.json()
        return data.count
      },

      async sendMessage(conversationId: string | null, message: string): Promise<void> {
        // TODO: Implement streaming
        throw new Error('sendMessage not yet implemented')
      },

      async archiveConversation(id: string): Promise<void> {
        const response = await fetch(
          `${API_BASE}/chat/conversations/${encodeURIComponent(id)}/archive`,
          {
            method: 'POST',
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to archive conversation: ${response.statusText}`)
        }
      },

      async createConversation(
        id: string,
        title: string | undefined,
        createdAt: string
      ): Promise<ChatConversationDTO> {
        const response = await fetch(`${API_BASE}/chat/conversations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id, title, createdAt }),
        })

        if (!response.ok) {
          throw new Error(`Failed to create conversation: ${response.statusText}`)
        }

        return response.json()
      },

      async saveInteraction(
        conversationId: string,
        interaction: ChatInteractionDTO
      ): Promise<void> {
        const response = await fetch(
          `${API_BASE}/chat/conversations/${encodeURIComponent(conversationId)}/interactions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(interaction),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to save interaction: ${response.statusText}`)
        }
      },
    },

    extensions: {
      async getAvailable(): Promise<ExtensionListItem[]> {
        const response = await fetch(`${API_BASE}/extensions/available`)

        if (!response.ok) {
          throw new Error(`Failed to fetch available extensions: ${response.statusText}`)
        }

        return response.json()
      },

      async search(
        query?: string,
        category?: string,
        verified?: boolean
      ): Promise<ExtensionListItem[]> {
        const params = new URLSearchParams()
        if (query) params.append('q', query)
        if (category) params.append('category', category)
        if (verified !== undefined) params.append('verified', String(verified))

        const url = `${API_BASE}/extensions/search${params.toString() ? `?${params}` : ''}`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`Failed to search extensions: ${response.statusText}`)
        }

        return response.json()
      },

      async getDetails(id: string): Promise<ExtensionDetails> {
        const response = await fetch(
          `${API_BASE}/extensions/registry/${encodeURIComponent(id)}`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch extension details: ${response.statusText}`)
        }

        return response.json()
      },

      async getInstalled(): Promise<InstalledExtension[]> {
        const response = await fetch(`${API_BASE}/extensions/installed`)

        if (!response.ok) {
          throw new Error(`Failed to fetch installed extensions: ${response.statusText}`)
        }

        return response.json()
      },

      async install(extensionId: string, version?: string): Promise<InstallResult> {
        const response = await fetch(`${API_BASE}/extensions/install`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ extensionId, version }),
        })

        return response.json()
      },

      async uninstall(
        extensionId: string
      ): Promise<{ success: boolean; error?: string }> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}`,
          {
            method: 'DELETE',
          }
        )

        return response.json()
      },

      async enable(extensionId: string): Promise<{ success: boolean }> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/enable`,
          {
            method: 'POST',
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to enable extension: ${response.statusText}`)
        }

        return response.json()
      },

      async disable(extensionId: string): Promise<{ success: boolean }> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/disable`,
          {
            method: 'POST',
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to disable extension: ${response.statusText}`)
        }

        return response.json()
      },

      async checkUpdates(): Promise<
        Array<{ extensionId: string; currentVersion: string; latestVersion: string }>
      > {
        const response = await fetch(`${API_BASE}/extensions/updates`)

        if (!response.ok) {
          throw new Error(`Failed to check for updates: ${response.statusText}`)
        }

        return response.json()
      },

      async update(extensionId: string, version?: string): Promise<InstallResult> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/update`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ version }),
          }
        )

        return response.json()
      },
    },
  }
}

// Legacy exports for backward compatibility
export const fetchGreeting = (name?: string) => createHttpApiClient().getGreeting(name)
export const fetchThemes = () => createHttpApiClient().getThemes()
export const fetchThemeTokens = (id: string) => createHttpApiClient().getThemeTokens(id)
export const fetchExtensions = () => createHttpApiClient().getExtensions()
