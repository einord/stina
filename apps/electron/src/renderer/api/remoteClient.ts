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
  ExtensionToolInfo,
  User,
  DeviceInfo,
  Invitation,
  SetupStatus,
  RegistrationOptionsResponse,
  AuthResponse,
  InvitationValidation,
  ChatStreamEvent,
  ChatStreamOptions,
} from '@stina/ui-vue'
import type { ModelInfo, ToolResult, ActionResult } from '@stina/extension-api'

/**
 * Get authorization headers if access token exists.
 */
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('stina_access_token')
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

/**
 * Dispatch a custom event for admin data changes.
 */
function dispatchAdminEvent(type: 'users-changed' | 'invitations-changed'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`stina-${type}`))
  }
}

/**
 * Creates an HTTP-based API client for connecting to a remote Stina API server.
 * This is used in Electron when running in remote mode.
 *
 * @param webUrl - The base URL of the web application (e.g., "https://stina.example.com")
 */
export function createRemoteApiClient(webUrl: string): ApiClient {
  // Validate the web URL before using it
  let parsedUrl: URL
  try {
    parsedUrl = new URL(webUrl)
  } catch (error) {
    throw new Error(`Invalid webUrl provided to createRemoteApiClient: ${String(webUrl)}`)
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol for webUrl in createRemoteApiClient: ${parsedUrl.protocol}. Only http and https are allowed.`,
    )
  }

  // Normalize the web URL and add /api prefix
  // The API is served from the same domain with /api prefix
  const normalizedUrl = webUrl.endsWith('/') ? webUrl.slice(0, -1) : webUrl
  const API_BASE = `${normalizedUrl}/api`

  return {
    auth: {
      async getSetupStatus(): Promise<SetupStatus> {
        const response = await fetch(`${API_BASE}/auth/setup/status`)
        if (!response.ok) {
          throw new Error(`Failed to get setup status: ${response.statusText}`)
        }
        return response.json()
      },

      async completeSetup(rpId: string, rpOrigin: string): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/auth/setup/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rpId, rpOrigin }),
        })
        if (!response.ok) {
          throw new Error(`Failed to complete setup: ${response.statusText}`)
        }
        return response.json()
      },

      async getRegistrationOptions(
        username: string,
        displayName?: string,
        invitationToken?: string
      ): Promise<RegistrationOptionsResponse> {
        const response = await fetch(`${API_BASE}/auth/register/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, displayName, invitationToken }),
        })
        if (!response.ok) {
          throw new Error(`Failed to get registration options: ${response.statusText}`)
        }
        return response.json()
      },

      async verifyRegistration(
        username: string,
        credential: unknown,
        invitationToken?: string
      ): Promise<AuthResponse> {
        const response = await fetch(`${API_BASE}/auth/register/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, credential, invitationToken }),
        })
        if (!response.ok) {
          throw new Error(`Failed to verify registration: ${response.statusText}`)
        }
        return response.json()
      },

      async getLoginOptions(username?: string): Promise<unknown> {
        const response = await fetch(`${API_BASE}/auth/login/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        })
        if (!response.ok) {
          throw new Error(`Failed to get login options: ${response.statusText}`)
        }
        return response.json()
      },

      async verifyLogin(credential: unknown, deviceInfo?: DeviceInfo): Promise<AuthResponse> {
        const response = await fetch(`${API_BASE}/auth/login/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential, deviceInfo }),
        })
        if (!response.ok) {
          throw new Error(`Failed to verify login: ${response.statusText}`)
        }
        return response.json()
      },

      async refresh(refreshToken: string): Promise<AuthResponse> {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!response.ok) {
          throw new Error(`Failed to refresh token: ${response.statusText}`)
        }
        return response.json()
      },

      async logout(refreshToken: string): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!response.ok) {
          throw new Error(`Failed to logout: ${response.statusText}`)
        }
        return response.json()
      },

      async getMe(): Promise<User> {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error(`Failed to get user: ${response.statusText}`)
        }
        return response.json()
      },

      async listUsers(): Promise<User[]> {
        const response = await fetch(`${API_BASE}/auth/users`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error(`Failed to list users: ${response.statusText}`)
        }
        return response.json()
      },

      async updateUserRole(id: string, role: 'admin' | 'user'): Promise<User> {
        const response = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(id)}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ role }),
        })
        if (!response.ok) {
          throw new Error(`Failed to update user role: ${response.statusText}`)
        }
        const user = await response.json()
        dispatchAdminEvent('users-changed')
        return user
      },

      async deleteUser(id: string): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error(`Failed to delete user: ${response.statusText}`)
        }
        const result = await response.json()
        dispatchAdminEvent('users-changed')
        return result
      },

      async createInvitation(
        username: string,
        role?: 'admin' | 'user'
      ): Promise<{ token: string; expiresAt: Date }> {
        const response = await fetch(`${API_BASE}/auth/users/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ username, role }),
        })
        if (!response.ok) {
          throw new Error(`Failed to create invitation: ${response.statusText}`)
        }
        const data = await response.json()
        dispatchAdminEvent('invitations-changed')
        return { ...data, expiresAt: new Date(data.expiresAt) }
      },

      async listInvitations(): Promise<Invitation[]> {
        const response = await fetch(`${API_BASE}/auth/invitations`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error(`Failed to list invitations: ${response.statusText}`)
        }
        const data = await response.json()
        return data.map((inv: Record<string, unknown>) => ({
          ...inv,
          expiresAt: new Date(inv['expiresAt'] as string),
          createdAt: new Date(inv['createdAt'] as string),
        }))
      },

      async validateInvitation(token: string): Promise<InvitationValidation> {
        const response = await fetch(`${API_BASE}/auth/invitations/${encodeURIComponent(token)}`)
        if (!response.ok) {
          throw new Error(`Failed to validate invitation: ${response.statusText}`)
        }
        return response.json()
      },

      async deleteInvitation(id: string): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/auth/invitations/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error(`Failed to delete invitation: ${response.statusText}`)
        }
        const result = await response.json()
        dispatchAdminEvent('invitations-changed')
        return result
      },
    },

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
      const response = await fetch(`${API_BASE}/extensions`, {
        headers: getAuthHeaders(),
      })

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

    // No-op in remote mode (themes are managed on server)
    async reloadThemes(): Promise<void> {
      return
    },

    chat: {
      async listConversations(): Promise<ChatConversationSummaryDTO[]> {
        const response = await fetch(`${API_BASE}/chat/conversations`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch conversations: ${response.statusText}`)
        }

        return response.json()
      },

      async getConversation(id: string): Promise<ChatConversationDTO> {
        const response = await fetch(`${API_BASE}/chat/conversations/${encodeURIComponent(id)}`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch conversation: ${response.statusText}`)
        }

        return response.json()
      },

      async getLatestActiveConversation(): Promise<ChatConversationDTO | null> {
        const response = await fetch(`${API_BASE}/chat/conversations/latest`, {
          headers: getAuthHeaders(),
        })

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
        const response = await fetch(url, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch interactions: ${response.statusText}`)
        }

        return response.json()
      },

      async countConversationInteractions(conversationId: string): Promise<number> {
        const response = await fetch(
          `${API_BASE}/chat/conversations/${encodeURIComponent(conversationId)}/interactions/count`,
          {
            headers: getAuthHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to count interactions: ${response.statusText}`)
        }

        const data = await response.json()
        return data.count
      },

      async sendMessage(_conversationId: string | null, _message: string): Promise<void> {
        throw new Error('sendMessage not yet implemented for remote mode')
      },

      async archiveConversation(id: string): Promise<void> {
        const response = await fetch(
          `${API_BASE}/chat/conversations/${encodeURIComponent(id)}/archive`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
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
            ...getAuthHeaders(),
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
              ...getAuthHeaders(),
            },
            body: JSON.stringify(interaction),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to save interaction: ${response.statusText}`)
        }
      },

      // Chat streaming via SSE (same as web)
      async streamMessage(
        conversationId: string | null,
        message: string,
        options: ChatStreamOptions
      ): Promise<() => void> {
        const { queueId, role, context, sessionId, onEvent } = options
        let active = true

        const body = JSON.stringify({
          conversationId,
          message,
          queueId,
          role,
          context,
          sessionId,
        })

        // Use fetch with streaming response
        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...getAuthHeaders(),
          },
          body,
        })

        if (!response.ok) {
          throw new Error(`Failed to start stream: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        // Process the stream in the background
        ;(async () => {
          try {
            while (active) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })

              // Process complete SSE events
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6)
                  if (data === '[DONE]') continue

                  try {
                    const event = JSON.parse(data) as ChatStreamEvent
                    if (event.queueId === queueId || event.type === 'queue-update') {
                      onEvent(event)
                    }
                  } catch {
                    // Ignore malformed events
                  }
                }
              }
            }
          } catch (error) {
            if (active) {
              onEvent({
                type: 'stream-error',
                error: error instanceof Error ? error.message : String(error),
                queueId,
              })
            }
          }
        })()

        // Return cleanup function
        return () => {
          active = false
          reader.cancel().catch(() => {})
        }
      },

      // Queue operations for remote mode
      async abortStream(sessionId?: string, conversationId?: string): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/chat/stream/abort`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ sessionId, conversationId }),
        })
        return response.json()
      },

      async getQueueState(
        sessionId?: string,
        conversationId?: string
      ): Promise<{ queued: Array<{ id: string; role: 'user' | 'instruction'; preview: string }>; isProcessing: boolean }> {
        const params = new URLSearchParams()
        if (sessionId) params.append('sessionId', sessionId)
        if (conversationId) params.append('conversationId', conversationId)

        const response = await fetch(`${API_BASE}/chat/queue/state?${params}`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          return { queued: [], isProcessing: false }
        }
        return response.json()
      },

      async removeQueued(
        id: string,
        sessionId?: string,
        conversationId?: string
      ): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/chat/queue/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ id, sessionId, conversationId }),
        })
        return response.json()
      },

      async resetQueue(sessionId?: string, conversationId?: string): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/chat/queue/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ sessionId, conversationId }),
        })
        return response.json()
      },
    },

    extensions: {
      async getAvailable(): Promise<ExtensionListItem[]> {
        const response = await fetch(`${API_BASE}/extensions/available`, {
          headers: getAuthHeaders(),
        })

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
        const response = await fetch(url, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to search extensions: ${response.statusText}`)
        }

        return response.json()
      },

      async getDetails(id: string): Promise<ExtensionDetails> {
        const response = await fetch(
          `${API_BASE}/extensions/registry/${encodeURIComponent(id)}`,
          {
            headers: getAuthHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch extension details: ${response.statusText}`)
        }

        return response.json()
      },

      async getInstalled(): Promise<InstalledExtension[]> {
        const response = await fetch(`${API_BASE}/extensions/installed`, {
          headers: getAuthHeaders(),
        })

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
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ extensionId, version }),
        })

        return response.json()
      },

      async uninstall(extensionId: string): Promise<{ success: boolean; error?: string }> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }
        )

        return response.json()
      },

      async enable(extensionId: string): Promise<{ success: boolean }> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/enable`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
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
            headers: getAuthHeaders(),
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
        const response = await fetch(`${API_BASE}/extensions/updates`, {
          headers: getAuthHeaders(),
        })

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
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ version }),
          }
        )

        return response.json()
      },

      async getSettings(extensionId: string): Promise<ExtensionSettingsResponse> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/settings`,
          {
            headers: getAuthHeaders(),
          }
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
              ...getAuthHeaders(),
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
        const response = await fetch(`${API_BASE}/extensions/providers`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.statusText}`)
        }

        return response.json()
      },

      async getProviderModels(
        providerId: string,
        options?: { settings?: Record<string, unknown> }
      ): Promise<ModelInfo[]> {
        if (options?.settings) {
          const response = await fetch(
            `${API_BASE}/extensions/providers/${encodeURIComponent(providerId)}/models`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
              },
              body: JSON.stringify({ settings: options.settings }),
            }
          )

          if (!response.ok) {
            throw new Error(`Failed to fetch provider models: ${response.statusText}`)
          }

          return response.json()
        }

        const response = await fetch(
          `${API_BASE}/extensions/providers/${encodeURIComponent(providerId)}/models`,
          {
            headers: getAuthHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch provider models: ${response.statusText}`)
        }

        return response.json()
      },

      async getTools(extensionId: string): Promise<ExtensionToolInfo[]> {
        const response = await fetch(
          `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/tools`,
          {
            headers: getAuthHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch extension tools: ${response.statusText}`)
        }

        return response.json()
      },
    },

    tools: {
      async getSettingsViews(): Promise<ToolSettingsViewInfo[]> {
        const response = await fetch(`${API_BASE}/tools/settings`, {
          headers: getAuthHeaders(),
        })

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
            ...getAuthHeaders(),
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
        const response = await fetch(`${API_BASE}/extensions/panels`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch panel views: ${response.statusText}`)
        }

        return response.json()
      },
    },

    actions: {
      async list(): Promise<ActionInfo[]> {
        const response = await fetch(`${API_BASE}/extensions/actions`, {
          headers: getAuthHeaders(),
        })

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
              ...getAuthHeaders(),
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
          // EventSource doesn't support custom headers, so pass token via query parameter
          const token = localStorage.getItem('stina_access_token')
          const url = token
            ? `${API_BASE}/extensions/events?token=${encodeURIComponent(token)}`
            : `${API_BASE}/extensions/events`
          source = new EventSource(url)
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
        const response = await fetch(`${API_BASE}/settings/ai/models`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch model configs: ${response.statusText}`)
        }

        return response.json()
      },

      async get(id: string): Promise<ModelConfigDTO> {
        const response = await fetch(
          `${API_BASE}/settings/ai/models/${encodeURIComponent(id)}`,
          {
            headers: getAuthHeaders(),
          }
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
            ...getAuthHeaders(),
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
              ...getAuthHeaders(),
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
            headers: getAuthHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to delete model config: ${response.statusText}`)
        }

        return response.json()
      },
    },

    userDefaultModel: {
      async get(): Promise<ModelConfigDTO | null> {
        const response = await fetch(`${API_BASE}/settings/user/default-model`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch user default model: ${response.statusText}`)
        }

        return response.json()
      },

      async set(modelConfigId: string | null): Promise<{ success: boolean }> {
        const response = await fetch(`${API_BASE}/settings/user/default-model`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ modelConfigId }),
        })

        if (!response.ok) {
          throw new Error(`Failed to set user default model: ${response.statusText}`)
        }

        return response.json()
      },
    },

    settings: {
      async get(): Promise<AppSettingsDTO> {
        const response = await fetch(`${API_BASE}/settings/app`, {
          headers: getAuthHeaders(),
        })

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
            ...getAuthHeaders(),
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
          const response = await fetch(`${API_BASE}/settings/quick-commands`, {
            headers: getAuthHeaders(),
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch quick commands: ${response.statusText}`)
          }

          return response.json()
        },

        async get(id: string): Promise<QuickCommandDTO> {
          const response = await fetch(
            `${API_BASE}/settings/quick-commands/${encodeURIComponent(id)}`,
            {
              headers: getAuthHeaders(),
            }
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
              ...getAuthHeaders(),
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
                ...getAuthHeaders(),
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
              headers: getAuthHeaders(),
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
              ...getAuthHeaders(),
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
