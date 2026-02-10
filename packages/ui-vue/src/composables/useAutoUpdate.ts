import { ref, computed, onMounted, onUnmounted } from 'vue'
import { tryUseApp } from './useApp.js'

interface UpdateInfo {
  version: string
  releaseDate: string
  releaseName?: string
}

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  info: UpdateInfo | null
  error: string | null
  progress: number | null
}

// Shared singleton state across all consumers
const status = ref<UpdateState['status']>('idle')
const updateInfo = ref<UpdateInfo | null>(null)
const error = ref<string | null>(null)
const progress = ref<number | null>(null)
const channel = ref<'stable' | 'beta'>('stable')

let cleanup: (() => void) | null = null
let subscriberCount = 0
let channelLoaded = false

function getElectronAPI() {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return window.electronAPI
  }
  return null
}

async function loadChannel() {
  if (channelLoaded) return
  try {
    const api = getElectronAPI()
    if (api) {
      channel.value = await api.autoUpdateGetChannel()
      channelLoaded = true
    }
  } catch {
    // Channel load failed, keep default
  }
}

function ensureSubscription() {
  if (cleanup) return

  const api = getElectronAPI()
  if (!api) return

  cleanup = api.onAutoUpdateState((state: UpdateState) => {
    status.value = state.status
    updateInfo.value = state.info
    error.value = state.error
    progress.value = state.progress
  })
}

function checkForUpdate() {
  const api = getElectronAPI()
  if (api) {
    api.autoUpdateCheck()
  }
}

function quitAndInstall() {
  const api = getElectronAPI()
  if (api) {
    api.autoUpdateQuitAndInstall()
  }
}

async function setChannel(newChannel: 'stable' | 'beta') {
  try {
    const api = getElectronAPI()
    if (api) {
      await api.autoUpdateSetChannel(newChannel)
      channel.value = newChannel
    }
  } catch {
    // Channel change failed silently
  }
}

export function useAutoUpdate() {
  const appInfo = tryUseApp()
  const isSupported = computed(() => appInfo?.appType === 'electron')
  const isUpdateReady = computed(() => status.value === 'downloaded')

  onMounted(() => {
    if (!isSupported.value) return

    subscriberCount++
    ensureSubscription()
    void loadChannel()
  })

  onUnmounted(() => {
    if (!isSupported.value) return

    subscriberCount--
    if (subscriberCount === 0 && cleanup) {
      cleanup()
      cleanup = null
    }
  })

  return {
    status,
    updateInfo,
    error,
    progress,
    isUpdateReady,
    isSupported,
    channel,
    checkForUpdate,
    quitAndInstall,
    setChannel,
  }
}
