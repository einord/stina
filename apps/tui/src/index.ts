import { initI18n } from '@stina/i18n'
import { createCli } from './cli.js'

initI18n()
const cli = createCli()
cli.parse()
