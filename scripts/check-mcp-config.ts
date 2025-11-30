#!/usr/bin/env bun
import { listMCPServers } from '@stina/settings';

const config = await listMCPServers();
console.log('MCP Servers configured:');
console.log(JSON.stringify(config, null, 2));
