#!/usr/bin/env bun
/**
 * Configure Tandoor MCP Server in Stina
 *
 * This script adds the Tandoor MCP server to Stina's settings.
 * Make sure you've built the server first using setup-tandoor-mcp.sh
 */

import os from 'node:os';
import path from 'node:path';
import { upsertMCPServer } from '@stina/settings';

const mcpServerPath = path.join(os.homedir(), '.stina/mcp-servers/tandoor-mcp/target/release/tandoor-mcp');

async function main() {
  console.log('🔧 Configuring Tandoor MCP Server...\n');

  // Check environment variables
  const requiredEnvVars = ['TANDOOR_BASE_URL', 'TANDOOR_USERNAME', 'TANDOOR_PASSWORD'];
  const missing = requiredEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease set them before running this script:');
    console.error('   export TANDOOR_BASE_URL="http://your-tandoor-url:8080"');
    console.error('   export TANDOOR_USERNAME="your-username"');
    console.error('   export TANDOOR_PASSWORD="your-password"\n');
    process.exit(1);
  }

  try {
    // Add Tandoor MCP server to settings
    await upsertMCPServer({
      name: 'tandoor',
      type: 'stdio',
      command: mcpServerPath,
    });

    console.log('✅ Tandoor MCP server configured successfully!\n');
    console.log('Configuration:');
    console.log(`   Name: tandoor`);
    console.log(`   Type: stdio`);
    console.log(`   Command: ${mcpServerPath}\n`);
    console.log('📋 Next steps:');
    console.log('   1. Restart Stina (bun run dev:all)');
    console.log('   2. The Tandoor tools will be automatically loaded');
    console.log('   3. Try asking: "Vad ska vi laga idag?"\n');
    console.log('🔍 To verify tools are loaded, check the console for:');
    console.log('   [tools] Loading tools from tandoor...');
    console.log('   [tools] Loaded X tools from tandoor\n');

  } catch (error) {
    console.error('❌ Failed to configure Tandoor MCP server:');
    console.error(error);
    process.exit(1);
  }
}

main();
