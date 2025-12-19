import type { ExtensionManifest, ExtensionCommand, ExtensionTheme } from './manifest.js'

/**
 * Registry for managing loaded extensions
 */
export class ExtensionRegistry {
  private extensions = new Map<string, ExtensionManifest>()

  /**
   * Register an extension
   */
  register(manifest: ExtensionManifest): void {
    if (this.extensions.has(manifest.id)) {
      throw new Error(`Extension ${manifest.id} is already registered`)
    }
    this.extensions.set(manifest.id, manifest)
  }

  /**
   * Unregister an extension
   */
  unregister(id: string): boolean {
    return this.extensions.delete(id)
  }

  /**
   * Get an extension by ID
   */
  get(id: string): ExtensionManifest | undefined {
    return this.extensions.get(id)
  }

  /**
   * List all registered extensions
   */
  list(): ExtensionManifest[] {
    return Array.from(this.extensions.values())
  }

  /**
   * Get all themes from all extensions
   */
  getThemes(): ExtensionTheme[] {
    const themes: ExtensionTheme[] = []
    for (const ext of this.extensions.values()) {
      if (ext.contributes?.themes) {
        themes.push(...ext.contributes.themes)
      }
    }
    return themes
  }

  /**
   * Get all commands from all extensions
   */
  getCommands(): ExtensionCommand[] {
    const commands: ExtensionCommand[] = []
    for (const ext of this.extensions.values()) {
      if (ext.contributes?.commands) {
        commands.push(...ext.contributes.commands)
      }
    }
    return commands
  }

  /**
   * Clear all registered extensions
   */
  clear(): void {
    this.extensions.clear()
  }
}

/**
 * Default global extension registry
 */
export const extensionRegistry = new ExtensionRegistry()
