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

export function useAutoUpdate() {
  const appInfo = tryUseApp()
  const isSupported = computed(() => appInfo?.appType === 'electron')

  const status = ref<UpdateState['status']>('idle')
  const updateInfo = ref<UpdateInfo | null>(null)
  const error = ref<string | null>(null)
  const progress = ref<number | null>(null)
  const channel = ref<'stable' | 'beta'>('stable')
  const isUpdateReady = computed(() => status.value === 'downloaded')

  let cleanup: (() => void) | null = null

  function getElectronAPI() {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      return (window as any).electronAPI
    }
    return null
  }

  async function loadChannel() {
    const api = getElectronAPI()
    if (api) {
      channel.value = await api.autoUpdateGetChannel()
    }
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
    const api = getElectronAPI()
    if (api) {
      await api.autoUpdateSetChannel(newChannel)
      channel.value = newChannel
    }
  }

  onMounted(() => {
    if (!isSupported.value) return

    const api = getElectronAPI()
    if (!api) return

    loadChannel()

    cleanup = api.onAutoUpdateState((state: UpdateState) => {
      status.value = state.status
      updateInfo.value = state.info
      error.value = state.error
      progress.value = state.progress
    })
  })

  onUnmounted(() => {
    if (cleanup) {
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
