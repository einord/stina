#!/usr/bin/env bun
import { readSettings } from '@stina/settings';

const s = await readSettings();
console.log('Active provider:', s.activeProvider);
console.log('All providers:', JSON.stringify(s.providers, null, 2));
