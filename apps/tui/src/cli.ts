import { Command } from 'commander'
import { getGreeting, themeRegistry, ExtensionRegistry } from '@stina/core'
import { builtinExtensions } from '@stina/adapters-node'
import { t } from '@stina/i18n'

// Create extension registry and setup built-in extensions
const extensionRegistry = new ExtensionRegistry()
for (const ext of builtinExtensions) {
  extensionRegistry.register(ext)
}
for (const theme of extensionRegistry.getThemes()) {
  themeRegistry.registerTheme(theme.id, theme.label, theme.tokens)
}

export function createCli(): Command {
  const program = new Command()

  program.name('stina').description(t('cli.description')).version('0.5.0')

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

  return program
}
