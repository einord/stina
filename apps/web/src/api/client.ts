import type {
  Greeting,
  ThemeSummary,
  ExtensionSummary,
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
  ModelConfigDTO,
  AppSettingsDTO,
  QuickCommandDTO,
} from '@stina/shared'
import type {
  ThemeTokens,
  ApiClient,
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstallResult,
  ExtensionSettingsResponse,
  ExtensionEvent,
  ProviderInfo,
  PanelViewInfo,
  ToolSettingsViewInfo,
  ActionInfo,
} from '@stina/ui-vue'
import type { ModelInfo, ToolResult, ActionResult } from '@stina/extension-api'

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

      async sendMessage(_conversationId: string | null, _message: string): Promise<void> {
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

      async getSettings(extensionId: string): Promise<ExtensionSettingsResponse> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/settings`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch extension settings: ${response.statusText}`)
        }

        return response.json()
      },

      async updateSetting(
        extensionId: string,
        key: string,
        value: unknown
      ): Promise<{ success: boolean }> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/settings`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key, value }),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to update extension setting: ${response.statusText}`)
        }

        return response.json()
      },

      async getProviders(): Promise<ProviderInfo[]> {
        const response = await fetch(`${API_BASE}/extensions/providers`)

        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.statusText}`)
        }

        return response.json()
      },

      async getProviderModels(
        providerId: string,
        options?: { settings?: Record<string, unknown> }
      ): Promise<ModelInfo[]> {
        // Use POST with body if we have settings to pass
        if (options?.settings) {
          const response = await fetch(
            `${API_BASE}/extensions/providers/${encodeURIComponent(providerId)}/models`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ settings: options.settings }),
            }
          )

          if (!response.ok) {
            throw new Error(`Failed to fetch provider models: ${response.statusText}`)
          }

          return response.json()
        }

        // GET for simple requests without settings
        const response = await fetch(
          `${API_BASE}/extensions/providers/${encodeURIComponent(providerId)}/models`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch provider models: ${response.statusText}`)
        }

        return response.json()
      },
    },

    tools: {
      async getSettingsViews(): Promise<ToolSettingsViewInfo[]> {
        const response = await fetch(`${API_BASE}/tools/settings`)

        if (!response.ok) {
          throw new Error(`Failed to fetch tool settings: ${response.statusText}`)
        }

        return response.json()
      },

      async executeTool(
        extensionId: string,
        toolId: string,
        params: Record<string, unknown>
      ): Promise<ToolResult> {
        const response = await fetch(`${API_BASE}/tools/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ extensionId, toolId, params }),
        })

        if (!response.ok) {
          throw new Error(`Failed to execute tool: ${response.statusText}`)
        }

        return response.json()
      },
    },

    panels: {
      async list(): Promise<PanelViewInfo[]> {
        const response = await fetch(`${API_BASE}/extensions/panels`)

        if (!response.ok) {
          throw new Error(`Failed to fetch panel views: ${response.statusText}`)
        }

        return response.json()
      },
    },

    actions: {
      async list(): Promise<ActionInfo[]> {
        const response = await fetch(`${API_BASE}/extensions/actions`)

        if (!response.ok) {
          throw new Error(`Failed to fetch actions: ${response.statusText}`)
        }

        return response.json()
      },

      async execute(
        extensionId: string,
        actionId: string,
        params: Record<string, unknown>
      ): Promise<ActionResult> {
        const response = await fetch(
          `${API_BASE}/extensions/actions/${encodeURIComponent(extensionId)}/${encodeURIComponent(actionId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ params }),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to execute action: ${response.statusText}`)
        }

        return response.json()
      },
    },

    events: {
      subscribe(handler: (event: ExtensionEvent) => void): () => void {
        let active = true
        let source: EventSource | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let retryMs = 1000
        const maxRetryMs = 30000

        const onMessage = (event: MessageEvent) => {
          try {
            const payload = JSON.parse(event.data) as ExtensionEvent
            handler(payload)
          } catch {
            // Ignore malformed events
          }
        }

        const onOpen = () => {
          retryMs = 1000
        }

        const cleanupSource = () => {
          if (!source) return
          source.removeEventListener('message', onMessage)
          source.removeEventListener('error', onError)
          source.removeEventListener('open', onOpen)
          source.close()
          source = null
        }

        const scheduleReconnect = () => {
          if (!active || reconnectTimer) return
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (!active) return
            connect()
          }, retryMs)
          retryMs = Math.min(maxRetryMs, retryMs * 2)
        }

        const onError = () => {
          if (!active) return
          cleanupSource()
          scheduleReconnect()
        }

        const connect = () => {
          cleanupSource()
          if (!active) return
          source = new EventSource(`${API_BASE}/extensions/events`)
          source.addEventListener('message', onMessage)
          source.addEventListener('error', onError)
          source.addEventListener('open', onOpen)
        }

        connect()

        return () => {
          active = false
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
          }
          cleanupSource()
        }
      },
    },

    modelConfigs: {
      async list(): Promise<ModelConfigDTO[]> {
        const response = await fetch(`${API_BASE}/settings/ai/models`)

        if (!response.ok) {
          throw new Error(`Failed to fetch model configs: ${response.statusText}`)
        }

        return response.json()
      },

      async get(id: string): Promise<ModelConfigDTO> {
        const response = await fetch(
          `${API_BASE}/settings/ai/models/${encodeURIComponent(id)}`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch model config: ${response.statusText}`)
        }

        return response.json()
      },

      async create(
        config: Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>
      ): Promise<ModelConfigDTO> {
        const response = await fetch(`${API_BASE}/settings/ai/models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(config),
        })

        if (!response.ok) {
          throw new Error(`Failed to create model config: ${response.statusText}`)
        }

        return response.json()
      },

      async update(
        id: string,
        config: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>
      ): Promise<ModelConfigDTO> {
        const response = await fetch(
          `${API_BASE}/settings/ai/models/${encodeURIComponent(id)}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to update model config: ${response.statusText}`)
        }

        return response.json()
      },

      async delete(id: string): Promise<{ success: boolean }> {
        const response = await fetch(
          `${API_BASE}/settings/ai/models/${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to delete model config: ${response.statusText}`)
        }

        return response.json()
      },

      async setDefault(id: string): Promise<{ success: boolean }> {
        const response = await fetch(
          `${API_BASE}/settings/ai/models/${encodeURIComponent(id)}/default`,
          {
            method: 'POST',
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to set default model: ${response.statusText}`)
        }

        return response.json()
      },
    },

    settings: {
      async get(): Promise<AppSettingsDTO> {
        const response = await fetch(`${API_BASE}/settings/app`)

        if (!response.ok) {
          throw new Error(`Failed to fetch app settings: ${response.statusText}`)
        }

        return response.json()
      },

      async update(settings: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> {
        const response = await fetch(`${API_BASE}/settings/app`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(settings),
        })

        if (!response.ok) {
          throw new Error(`Failed to update app settings: ${response.statusText}`)
        }

        const updated = (await response.json()) as AppSettingsDTO
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('stina-settings-updated', { detail: updated }))
        }
        return updated
      },

      async getTimezones(): Promise<Array<{ id: string; label: string }>> {
        const response = await fetch(`${API_BASE}/settings/timezones`)

        if (!response.ok) {
          throw new Error(`Failed to fetch timezones: ${response.statusText}`)
        }

        return response.json()
      },

      quickCommands: {
        async list(): Promise<QuickCommandDTO[]> {
          const response = await fetch(`${API_BASE}/settings/quick-commands`)

          if (!response.ok) {
            throw new Error(`Failed to fetch quick commands: ${response.statusText}`)
          }

          return response.json()
        },

        async get(id: string): Promise<QuickCommandDTO> {
          const response = await fetch(
            `${API_BASE}/settings/quick-commands/${encodeURIComponent(id)}`
          )

          if (!response.ok) {
            throw new Error(`Failed to fetch quick command: ${response.statusText}`)
          }

          return response.json()
        },

        async create(cmd: Omit<QuickCommandDTO, 'id'>): Promise<QuickCommandDTO> {
          const response = await fetch(`${API_BASE}/settings/quick-commands`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(cmd),
          })

          if (!response.ok) {
            throw new Error(`Failed to create quick command: ${response.statusText}`)
          }

          return response.json()
        },

        async update(
          id: string,
          cmd: Partial<Omit<QuickCommandDTO, 'id'>>
        ): Promise<QuickCommandDTO> {
          const response = await fetch(
            `${API_BASE}/settings/quick-commands/${encodeURIComponent(id)}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(cmd),
            }
          )

          if (!response.ok) {
            throw new Error(`Failed to update quick command: ${response.statusText}`)
          }

          return response.json()
        },

        async delete(id: string): Promise<{ success: boolean }> {
          const response = await fetch(
            `${API_BASE}/settings/quick-commands/${encodeURIComponent(id)}`,
            {
              method: 'DELETE',
            }
          )

          if (!response.ok) {
            throw new Error(`Failed to delete quick command: ${response.statusText}`)
          }

          return response.json()
        },

        async reorder(ids: string[]): Promise<{ success: boolean }> {
          const response = await fetch(`${API_BASE}/settings/quick-commands/reorder`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids }),
          })

          if (!response.ok) {
            throw new Error(`Failed to reorder quick commands: ${response.statusText}`)
          }

          return response.json()
        },
      },
    },
  }
}

// Legacy exports for backward compatibility
export const fetchGreeting = (name?: string) => createHttpApiClient().getGreeting(name)
export const fetchThemes = () => createHttpApiClient().getThemes()
export const fetchThemeTokens = (id: string) => createHttpApiClient().getThemeTokens(id)
export const fetchExtensions = () => createHttpApiClient().getExtensions()
