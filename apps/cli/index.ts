#!/usr/bin/env bun
import { Command } from 'commander';
import store from '@stina/store';

const program = new Command();
program
  .name('stina')
  .description('Stina CLI – simple counter shared with GUI/TUI')
  .version('0.1.0');

program
  .command('show')
  .description('Show current count')
  .action(() => {
    console.log(store.getCount());
  });

program
  .command('add')
  .description('Increment count by 1')
  .option('-n, --by <number>', 'Increment by', (v) => parseInt(v, 10), 1)
  .action(async (opts) => {
    const c = await store.increment(Number(opts.by ?? 1));
    console.log(c);
  });

program
  .action(() => {
    console.log(store.getCount());
  });

program.parseAsync();