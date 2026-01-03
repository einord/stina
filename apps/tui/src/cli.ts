import { Command } from 'commander'
import { getGreeting, themeRegistry, ExtensionRegistry } from '@stina/core'
import { builtinExtensions, getExtensionsPath } from '@stina/adapters-node'
import { ExtensionInstaller } from '@stina/extension-installer'
import { t } from '@stina/i18n'

// App version
const STINA_VERSION = '0.5.0'

// Create extension registry and setup built-in extensions
const extensionRegistry = new ExtensionRegistry()
for (const ext of builtinExtensions) {
  extensionRegistry.register(ext)
}
for (const theme of extensionRegistry.getThemes()) {
  themeRegistry.registerTheme(theme.id, theme.label, theme.tokens)
}

// Create extension installer
const extensionInstaller = new ExtensionInstaller({
  extensionsPath: getExtensionsPath(),
  stinaVersion: STINA_VERSION,
  platform: 'tui',
})

export function createCli(): Command {
  const program = new Command()

  program.name('stina').description(t('cli.description')).version(STINA_VERSION)

  // Default action when no command is provided - show help without error
  program.action(() => {
    program.outputHelp()
  })

  // Hello command
  program
    .command('hello')
    .description(t('cli.hello_command_description'))
    .option('-n, --name <name>', t('cli.hello_name_option'))
    .action((options: { name?: string }) => {
      const greeting = getGreeting(options.name)
      console.log(greeting.message)
      console.log(`${t('cli.hello_time_label')}: ${greeting.timestamp}`)
    })

  // Theme command
  program
    .command('theme')
    .description(t('cli.theme_command_description'))
    .option('-l, --list', t('cli.theme_list_option'))
    .action((options: { list?: boolean }) => {
      if (options.list) {
        const themes = themeRegistry.listThemes()
        console.log(t('cli.theme_list_title'))
        for (const theme of themes) {
          console.log(`  ${t('cli.theme_item', { id: theme.id, label: theme.label })}`)
        }
      } else {
        // In bootstrap, we just show the default theme
        console.log(t('cli.theme_current', { theme: 'dark' }))
      }
    })

  // Extension command group
  const ext = program
    .command('ext')
    .description('Manage Stina extensions')

  // ext search <query>
  ext
    .command('search [query]')
    .description('Search for extensions in the registry')
    .option('-c, --category <category>', 'Filter by category (ai-provider, tool, theme, utility)')
    .option('-v, --verified', 'Show only verified extensions')
    .action(async (query: string | undefined, options: { category?: string; verified?: boolean }) => {
      try {
        const results = await extensionInstaller.searchExtensions({
          query,
          category: options.category as 'ai-provider' | 'tool' | 'theme' | 'utility' | undefined,
          verified: options.verified,
        })

        if (results.length === 0) {
          console.log('No extensions found.')
          return
        }

        console.log(`\nFound ${results.length} extension(s):\n`)
        for (const ext of results) {
          const verified = ext.verified ? ' ✓' : ''
          console.log(`  ${ext.name} (${ext.id})${verified}`)
          console.log(`    ${ext.description}`)
          console.log(`    Version: ${ext.latestVersion} | Categories: ${ext.categories.join(', ')}`)
          console.log()
        }
      } catch (error) {
        console.error('Error searching extensions:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  // ext available
  ext
    .command('available')
    .description('List all available extensions from the registry')
    .action(async () => {
      try {
        const extensions = await extensionInstaller.getAvailableExtensions()

        if (extensions.length === 0) {
          console.log('No extensions available in the registry.')
          return
        }

        console.log(`\nAvailable extensions (${extensions.length}):\n`)
        for (const ext of extensions) {
          const verified = ext.verified ? ' ✓' : ''
          console.log(`  ${ext.name} (${ext.id})${verified}`)
          console.log(`    ${ext.description}`)
          console.log(`    Version: ${ext.latestVersion}`)
          console.log()
        }
      } catch (error) {
        console.error('Error fetching extensions:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  // ext list
  ext
    .command('list')
    .description('List installed extensions')
    .action(() => {
      const installed = extensionInstaller.getInstalledExtensions()

      if (installed.length === 0) {
        console.log('No extensions installed.')
        return
      }

      console.log(`\nInstalled extensions (${installed.length}):\n`)
      for (const ext of installed) {
        const status = ext.enabled ? '●' : '○'
        console.log(`  ${status} ${ext.id} v${ext.version}`)
        console.log(`    Installed: ${new Date(ext.installedAt).toLocaleDateString()}`)
        console.log()
      }
    })

  // ext install <id>
  ext
    .command('install <extensionId>')
    .description('Install an extension from the registry')
    .option('-v, --version <version>', 'Install a specific version')
    .action(async (extensionId: string, options: { version?: string }) => {
      console.log(`Installing ${extensionId}${options.version ? ` v${options.version}` : ''}...`)

      try {
        const result = await extensionInstaller.install(extensionId, options.version)

        if (result.success) {
          console.log(`✓ Successfully installed ${extensionId} v${result.version}`)
          console.log(`  Path: ${result.path}`)
          console.log('\nRestart Stina to load the new extension.')
        } else {
          console.error(`✗ Failed to install: ${result.error}`)
          process.exit(1)
        }
      } catch (error) {
        console.error('Error installing extension:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  // ext uninstall <id>
  ext
    .command('uninstall <extensionId>')
    .description('Uninstall an extension')
    .action(async (extensionId: string) => {
      console.log(`Uninstalling ${extensionId}...`)

      try {
        const result = await extensionInstaller.uninstall(extensionId)

        if (result.success) {
          console.log(`✓ Successfully uninstalled ${extensionId}`)
        } else {
          console.error(`✗ Failed to uninstall: ${result.error}`)
          process.exit(1)
        }
      } catch (error) {
        console.error('Error uninstalling extension:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  // ext enable <id>
  ext
    .command('enable <extensionId>')
    .description('Enable an installed extension')
    .action((extensionId: string) => {
      if (!extensionInstaller.isInstalled(extensionId)) {
        console.error(`Extension "${extensionId}" is not installed.`)
        process.exit(1)
      }

      extensionInstaller.enable(extensionId)
      console.log(`✓ Enabled ${extensionId}`)
    })

  // ext disable <id>
  ext
    .command('disable <extensionId>')
    .description('Disable an installed extension')
    .action((extensionId: string) => {
      if (!extensionInstaller.isInstalled(extensionId)) {
        console.error(`Extension "${extensionId}" is not installed.`)
        process.exit(1)
      }

      extensionInstaller.disable(extensionId)
      console.log(`✓ Disabled ${extensionId}`)
    })

  // ext update [id]
  ext
    .command('update [extensionId]')
    .description('Update an extension (or check for updates if no ID provided)')
    .action(async (extensionId?: string) => {
      try {
        if (extensionId) {
          console.log(`Updating ${extensionId}...`)
          const result = await extensionInstaller.update(extensionId)

          if (result.success) {
            console.log(`✓ Updated ${extensionId} to v${result.version}`)
          } else {
            console.error(`✗ Failed to update: ${result.error}`)
            process.exit(1)
          }
        } else {
          console.log('Checking for updates...')
          const updates = await extensionInstaller.checkForUpdates()

          if (updates.length === 0) {
            console.log('All extensions are up to date.')
            return
          }

          console.log(`\nUpdates available (${updates.length}):\n`)
          for (const update of updates) {
            console.log(`  ${update.extensionId}: ${update.currentVersion} → ${update.latestVersion}`)
          }
          console.log('\nRun `stina ext update <id>` to update an extension.')
        }
      } catch (error) {
        console.error('Error checking updates:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  // ext info <id>
  ext
    .command('info <extensionId>')
    .description('Show detailed information about an extension')
    .action(async (extensionId: string) => {
      try {
        const details = await extensionInstaller.getExtensionDetails(extensionId)
        const installed = extensionInstaller.getInstalledExtension(extensionId)

        console.log(`\n${details.name}`)
        console.log('='.repeat(details.name.length))
        console.log()
        console.log(`ID: ${details.id}`)
        console.log(`Author: ${details.author.name}${details.author.url ? ` (${details.author.url})` : ''}`)
        console.log(`License: ${details.license}`)
        console.log(`Categories: ${details.categories.join(', ')}`)
        console.log(`Verified: ${details.verified ? 'Yes' : 'No'}`)
        console.log(`Repository: ${details.repository}`)
        console.log()
        console.log(details.description)
        console.log()

        if (installed) {
          console.log(`Status: Installed (v${installed.version}, ${installed.enabled ? 'enabled' : 'disabled'})`)
        } else {
          console.log('Status: Not installed')
        }

        console.log()
        console.log('Available versions:')
        for (const version of details.versions) {
          console.log(`  v${version.version} (${version.releaseDate}) - Requires Stina ${version.minStinaVersion}+`)
          console.log(`    Platforms: ${version.platforms.join(', ')}`)
          console.log(`    Permissions: ${version.permissions.join(', ')}`)
          if (version.changelog) {
            console.log(`    Changelog: ${version.changelog}`)
          }
        }
      } catch (error) {
        console.error('Error fetching extension info:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  return program
}
