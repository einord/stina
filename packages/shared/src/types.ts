/**
 * Greeting response from the hello endpoint/function
 */
export interface Greeting {
  message: string
  timestamp: string
}

/**
 * Health check response
 */
export interface HealthResponse {
  ok: boolean
}

/**
 * API error response
 */
export interface ApiError {
  error: {
    code: string
    message: string
  }
}

/**
 * Theme summary for listing
 */
export interface ThemeSummary {
  id: string
  label: string
}

/**
 * Extension summary for listing
 */
export interface ExtensionSummary {
  id: string
  name: string
  version: string
  type: 'feature' | 'theme'
}
