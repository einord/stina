#!/usr/bin/env bun
import { initI18n, t } from '@stina/i18n';
import store from '@stina/store';
import { Command } from 'commander';

// Initialize i18n from environment (LANG) if available
initI18n(process.env.LANG?.slice(0, 2));

const program = new Command();
program.name('stina').description(t('cli.description')).version('0.1.0');

program
  .command('show')
  .description(t('cli.show_description'))
  .action(() => {
    console.log(store.getCount());
  });

program
  .command('add')
  .description(t('cli.add_description'))
  .option('-n, --by <number>', 'Increment by', (v) => parseInt(v, 10), 1)
  .action(async (opts) => {
    const c = await store.increment(Number(opts.by ?? 1));
    console.log(c);
  });

program.action(() => {
  console.log(store.getCount());
});

program.parseAsync();
