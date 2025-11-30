#!/usr/bin/env bun
/**
 * Configure Tandoor MCP Server in Stina
 *
 * This script adds the Tandoor MCP server (stdio transport) to Stina's settings.
 * The server is located at ~/dev/tandoor-mcp
 */
import os from 'node:os';
import path from 'node:path';

import { upsertMCPServer } from '@stina/settings';

// Path to the tandoor-mcp server
const TANDOOR_MCP_PATH = path.join(os.homedir(), 'dev/tandoor-mcp/dist/index.js');

// Tandoor API configuration (from Claude Code config)
const TANDOOR_CONFIG = {
  TANDOOR_API_URL: 'https://tandoor.shcizo.se',
  TANDOOR_API_KEY: 'tda_901dcf97_5eca_4d5f_8f21_3f4aeb02af8c',
};

async function main() {
  console.log('🔧 Configuring Tandoor MCP Server (stdio)...\n');

  try {
    // Add Tandoor MCP server to settings as stdio server
    await upsertMCPServer({
      name: 'tandoor',
      type: 'stdio',
      command: 'node',
      args: TANDOOR_MCP_PATH,
      env: TANDOOR_CONFIG,
    });

    console.log('✅ Tandoor MCP server configured successfully!\n');
    console.log('Configuration:');
    console.log(`   Name: tandoor`);
    console.log(`   Type: stdio`);
    console.log(`   Command: node ${TANDOOR_MCP_PATH}`);
    console.log(`   API URL: ${TANDOOR_CONFIG.TANDOOR_API_URL}\n`);
    console.log('📋 Next steps:');
    console.log('   1. Restart Stina (bun run dev:all)');
    console.log('   2. The Tandoor tools will be automatically loaded');
    console.log('   3. Try asking: "Vad ska vi laga idag?"\n');
  } catch (error) {
    console.error('❌ Failed to configure Tandoor MCP server:');
    console.error(error);
    process.exit(1);
  }
}

main();
