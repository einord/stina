import { Command } from 'commander'
import { getGreeting, themeRegistry, ExtensionRegistry } from '@stina/core'
import { builtinExtensions } from '@stina/adapters-node'

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

  program.name('stina').description('Stina AI Assistant CLI').version('0.5.0')

  // Default action when no command is provided - show help without error
  program.action(() => {
    program.outputHelp()
  })

  // Hello command
  program
    .command('hello')
    .description('Get a greeting')
    .option('-n, --name <name>', 'Name to greet')
    .action((options: { name?: string }) => {
      const greeting = getGreeting(options.name)
      console.log(greeting.message)
      console.log(`Time: ${greeting.timestamp}`)
    })

  // Theme command
  program
    .command('theme')
    .description('Show current theme')
    .option('-l, --list', 'List available themes')
    .action((options: { list?: boolean }) => {
      if (options.list) {
        const themes = themeRegistry.listThemes()
        console.log('Available themes:')
        for (const theme of themes) {
          console.log(`  - ${theme.id}: ${theme.label}`)
        }
      } else {
        // In bootstrap, we just show the default theme
        console.log('Current theme: dark')
      }
    })

  return program
}
