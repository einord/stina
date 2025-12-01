/**
 * MCP Server Process Manager
 *
 * Shared utility for managing MCP server processes.
 * Used by both packages/core/tools.ts and apps/desktop/electron/main.ts
 */

import { type ChildProcess, spawn } from 'node:child_process';

import type { MCPServer } from '@stina/settings';

/** Track running MCP server processes */
const runningMcpProcesses = new Map<string, ChildProcess>();

/**
 * Starts a WebSocket MCP server process if it has a command configured.
 * Returns true if server was started or already running.
 */
export async function startWebSocketMcpServer(server: MCPServer): Promise<boolean> {
  // Check if already running
  if (runningMcpProcesses.has(server.name)) {
    console.log(`[mcp] Server ${server.name} already running`);
    return true;
  }

  if (!server.command) {
    return false;
  }

  console.log(`[mcp] Starting WebSocket MCP server: ${server.name}`);

  const args = server.args ? server.args.trim().split(/\s+/) : [];
  const process = spawn(server.command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningMcpProcesses.set(server.name, process);

  // Log output for debugging
  process.stdout?.on('data', (chunk) => {
    console.log(`[${server.name}]`, chunk.toString().trim());
  });

  process.stderr?.on('data', (chunk) => {
    console.error(`[${server.name}]`, chunk.toString().trim());
  });

  process.on('exit', (code) => {
    console.log(`[mcp] Server ${server.name} exited with code ${code}`);
    runningMcpProcesses.delete(server.name);
  });

  // Wait for server to start (give it 2 seconds)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return true;
}

/**
 * Stops all running MCP server processes.
 */
export function stopAllMcpServers(): void {
  console.log('[mcp] Shutting down MCP servers...');
  for (const [name, process] of runningMcpProcesses.entries()) {
    console.log(`[mcp] Stopping MCP server: ${name}`);
    process.kill();
  }
  runningMcpProcesses.clear();
}

/**
 * Gets the running MCP server processes map.
 * Useful for checking server status or iterating over running servers.
 */
export function getRunningMcpProcesses(): Map<string, ChildProcess> {
  return runningMcpProcesses;
}
