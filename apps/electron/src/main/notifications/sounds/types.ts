import type { NotificationSoundId } from '@stina/shared'

/**
 * Platform-specific sound mapping.
 * Maps semantic sound IDs to OS-native sound names.
 */
export type PlatformSounds = Record<NotificationSoundId, string | undefined>

/**
 * Sound option for UI display.
 */
export interface SoundOption {
  /** The semantic sound ID */
  id: NotificationSoundId
  /** i18n key for the label */
  labelKey: string
}
