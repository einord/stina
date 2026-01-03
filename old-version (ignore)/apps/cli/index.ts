#!/usr/bin/env bun
import { initI18n, t } from '@stina/i18n';
import { Command } from 'commander';

// Initialize i18n from environment (LANG) if available
initI18n(process.env.LANG?.slice(0, 2));

const program = new Command();
program.name('stina').description(t('cli.description')).version('0.1.0');

program
  .command('show')
  .description(t('cli.show_description'))
  .action(() => {
    console.log('Counters removed; CLI placeholder.');
  });

program.action(() => {
  console.log('Counters removed; CLI placeholder.');
});

program.parseAsync();
