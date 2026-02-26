import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Tracks window focus state and provides a callback for focus-gained transitions.
 * Listens to both window focus/blur events and document visibilitychange.
 */
export function useWindowFocus() {
  const isFocused = ref(typeof document !== 'undefined' ? document.hasFocus() && document.visibilityState === 'visible' : true)

  const focusGainedCallbacks: Array<() => void> = []

  function setFocused(focused: boolean): void {
    const wasFocused = isFocused.value
    isFocused.value = focused
    if (!wasFocused && focused) {
      for (const cb of focusGainedCallbacks) {
        cb()
      }
    }
  }

  function handleFocus(): void {
    setFocused(true)
  }

  function handleBlur(): void {
    setFocused(false)
  }

  function handleVisibilityChange(): void {
    setFocused(document.visibilityState === 'visible')
  }

  /**
   * Register a callback that fires when the window transitions from unfocused to focused.
   * Returns an unsubscribe function.
   */
  function onFocusGained(callback: () => void): () => void {
    focusGainedCallbacks.push(callback)
    return () => {
      const idx = focusGainedCallbacks.indexOf(callback)
      if (idx !== -1) focusGainedCallbacks.splice(idx, 1)
    }
  }

  onMounted(() => {
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('blur', handleBlur)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    isFocused,
    onFocusGained,
  }
}
