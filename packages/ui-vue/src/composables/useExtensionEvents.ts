import type { ApiClient, ExtensionEvent } from './useApi.js'
import { useApi } from './useApi.js'

type ExtensionEventHandler = (event: ExtensionEvent) => void

const listeners = new Set<ExtensionEventHandler>()
let stopSubscription: (() => void) | null = null
let activeApi: ApiClient | null = null

const dispatchEvent = (event: ExtensionEvent) => {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Ignore listener errors to keep others running.
    }
  }
}

const startSubscription = (api: ApiClient) => {
  if (stopSubscription) return
  activeApi = api
  stopSubscription = api.events.subscribe(dispatchEvent)
}

const stopIfIdle = () => {
  if (listeners.size > 0 || !stopSubscription) return
  stopSubscription()
  stopSubscription = null
  activeApi = null
}

export function useExtensionEvents() {
  const api = useApi()

  const subscribe = (handler: ExtensionEventHandler): (() => void) => {
    listeners.add(handler)
    if (!stopSubscription || activeApi !== api) {
      if (stopSubscription) {
        stopSubscription()
        stopSubscription = null
      }
      startSubscription(api)
    }

    return () => {
      listeners.delete(handler)
      stopIfIdle()
    }
  }

  return { subscribe }
}
