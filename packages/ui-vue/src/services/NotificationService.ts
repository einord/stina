import type {
  NotificationOptions,
  NotificationContext,
  NotificationResult,
} from '@stina/shared'
import { stripMarkdown } from '../utils/stripMarkdown.js'

/**
 * Adapter interface for platform-specific notification implementations
 */
export interface NotificationAdapter {
  /**
   * Show a notification
   */
  show(options: NotificationOptions): Promise<NotificationResult>

  /**
   * Check if the application window is focused
   */
  checkWindowFocus(): boolean

  /**
   * Focus the application window
   */
  focusWindow(): void

  /**
   * Request permission to show notifications (optional)
   */
  requestPermission?(): Promise<'granted' | 'denied'>
}

/**
 * Service for managing notifications across platforms.
 * Uses a platform-specific adapter for actual notification display.
 */
export class NotificationService {
  private adapter: NotificationAdapter
  private getCurrentView: () => string
  private soundCache = new Map<string, HTMLAudioElement>()

  constructor(adapter: NotificationAdapter, getCurrentView: () => string) {
    this.adapter = adapter
    this.getCurrentView = getCurrentView
  }

  /**
   * Show a notification if appropriate based on current context.
   * Will only show if the window is not focused or user is not in chat view.
   */
  async maybeShowNotification(options: NotificationOptions): Promise<NotificationResult> {
    const context: NotificationContext = {
      isWindowFocused: this.adapter.checkWindowFocus(),
      currentView: this.getCurrentView() as 'chat' | 'tools' | 'settings',
    }

    // Show notification if window is not focused OR user is not in chat view
    const shouldShow = !context.isWindowFocused || context.currentView !== 'chat'

    if (!shouldShow) {
      return { shown: false, reason: 'window-focused' }
    }

    const strippedBody = stripMarkdown(options.body)
    if (!strippedBody) {
      return { shown: false, reason: 'empty-content' }
    }

    // Play sound if configured
    if (options.sound && options.sound !== 'none') {
      await this.playSound(options.sound)
    }

    return this.adapter.show({
      ...options,
      body: strippedBody,
    })
  }

  /**
   * Show a test notification (always shows, ignores context)
   */
  async showTestNotification(options: NotificationOptions): Promise<NotificationResult> {
    if (options.sound && options.sound !== 'none') {
      await this.playSound(options.sound)
    }
    return this.adapter.show({
      ...options,
      body: stripMarkdown(options.body),
    })
  }

  /**
   * Play a notification sound.
   * Tries to play an MP3 file first, falls back to Web Audio API.
   */
  private async playSound(soundId: string): Promise<void> {
    try {
      // Check cache first
      let audio = this.soundCache.get(soundId)

      if (!audio) {
        // Create new audio element and cache it
        audio = new Audio(`/sounds/${soundId}.mp3`)
        this.soundCache.set(soundId, audio)
      }

      // Reset and play
      audio.currentTime = 0
      await audio.play()
    } catch {
      // Fall back to Web Audio API
      this.playGeneratedSound(soundId)
    }
  }

  /**
   * Play a generated notification sound using Web Audio API.
   * Used as fallback when MP3 files are not available.
   */
  private playGeneratedSound(soundId: string): void {
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext
      if (!AudioContext) return

      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      // Different sounds have different characteristics
      const soundConfig = this.getSoundConfig(soundId)

      oscillator.type = soundConfig.type
      oscillator.frequency.setValueAtTime(soundConfig.frequency, ctx.currentTime)

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + soundConfig.duration)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + soundConfig.duration)
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Get sound configuration for generated sounds
   */
  private getSoundConfig(soundId: string): { type: OscillatorType; frequency: number; duration: number } {
    const defaultConfig: { type: OscillatorType; frequency: number; duration: number } = {
      type: 'sine',
      frequency: 880,
      duration: 0.15,
    }

    const configs: Record<string, { type: OscillatorType; frequency: number; duration: number }> = {
      default: defaultConfig,
      glass: { type: 'sine', frequency: 1200, duration: 0.1 },
      ping: { type: 'sine', frequency: 1000, duration: 0.08 },
      pop: { type: 'sine', frequency: 600, duration: 0.05 },
      basso: { type: 'sine', frequency: 200, duration: 0.2 },
      submarine: { type: 'sine', frequency: 300, duration: 0.25 },
      hero: { type: 'triangle', frequency: 523, duration: 0.3 },
      funk: { type: 'square', frequency: 400, duration: 0.12 },
      purr: { type: 'sine', frequency: 150, duration: 0.3 },
      sosumi: { type: 'sine', frequency: 700, duration: 0.15 },
    }

    return configs[soundId] ?? defaultConfig
  }

  /**
   * Request permission to show notifications
   */
  async requestPermission(): Promise<'granted' | 'denied'> {
    if (this.adapter.requestPermission) {
      return this.adapter.requestPermission()
    }
    return 'granted'
  }

  /**
   * Focus the application window
   */
  focusWindow(): void {
    this.adapter.focusWindow()
  }
}
