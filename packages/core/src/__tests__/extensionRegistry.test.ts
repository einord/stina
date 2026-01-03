import { describe, it, expect, beforeEach } from 'vitest'
import { ExtensionRegistry } from '../extensions/registry.js'
import type { ExtensionManifest } from '../extensions/manifest.js'

describe('ExtensionRegistry', () => {
  let registry: ExtensionRegistry

  beforeEach(() => {
    registry = new ExtensionRegistry()
  })

  const createManifest = (id: string): ExtensionManifest => ({
    id,
    version: '1.0.0',
    name: `Test Extension ${id}`,
    type: 'feature',
    engines: { app: '>=0.5.0' },
  })

  it('should register an extension', () => {
    const manifest = createManifest('test.extension')

    registry.register(manifest)

    expect(registry.list()).toHaveLength(1)
    expect(registry.get('test.extension')).toBe(manifest)
  })

  it('should throw when registering duplicate extension', () => {
    const manifest = createManifest('test.extension')

    registry.register(manifest)

    expect(() => registry.register(manifest)).toThrow('already registered')
  })

  it('should unregister an extension', () => {
    const manifest = createManifest('test.extension')

    registry.register(manifest)
    const result = registry.unregister('test.extension')

    expect(result).toBe(true)
    expect(registry.list()).toHaveLength(0)
  })

  it('should return false when unregistering non-existent extension', () => {
    const result = registry.unregister('non.existent')

    expect(result).toBe(false)
  })

  it('should get themes from all extensions', () => {
    const themeExt: ExtensionManifest = {
      id: 'test.theme',
      version: '1.0.0',
      name: 'Theme Extension',
      type: 'theme',
      engines: { app: '>=0.5.0' },
      contributes: {
        themes: [
          {
            id: 'custom',
            label: 'Custom Theme',
            tokens: {
              background: '#000',
              foreground: '#fff',
              primary: '#00f',
              primaryText: '#fff',
              muted: '#333',
              mutedText: '#999',
              border: '#444',
              danger: '#f00',
              success: '#0f0',
              warning: '#ff0',
            },
          },
        ],
      },
    }

    registry.register(themeExt)

    const themes = registry.getThemes()
    expect(themes).toHaveLength(1)
    expect(themes[0]?.id).toBe('custom')
  })

  it('should get commands from all extensions', () => {
    const ext: ExtensionManifest = {
      id: 'test.commands',
      version: '1.0.0',
      name: 'Command Extension',
      type: 'feature',
      engines: { app: '>=0.5.0' },
      contributes: {
        commands: [
          { id: 'test.hello', title: 'Say Hello' },
          { id: 'test.bye', title: 'Say Goodbye' },
        ],
      },
    }

    registry.register(ext)

    const commands = registry.getCommands()
    expect(commands).toHaveLength(2)
  })

  it('should clear all extensions', () => {
    registry.register(createManifest('test.one'))
    registry.register(createManifest('test.two'))

    registry.clear()

    expect(registry.list()).toHaveLength(0)
  })
})
