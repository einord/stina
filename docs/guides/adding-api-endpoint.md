# Adding a New API Endpoint

This guide walks through adding a new API endpoint to Stina. Due to the ApiClient abstraction, you must implement the endpoint in multiple places to support both Web (HTTP) and Electron (IPC).

## Overview

Adding an endpoint requires changes in 6 locations:

1. API route (backend)
2. Server registration
3. ApiClient interface
4. HTTP client (Web)
5. IPC client (Electron renderer)
6. IPC handler (Electron main)

## Step 1: Create Route File

Create a new route file in `apps/api/src/routes/`.

```typescript
// apps/api/src/routes/myFeature.ts
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth.js'

export async function myFeatureRoutes(fastify: FastifyInstance) {
  // GET endpoint
  fastify.get('/my-feature', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id
    // Call core/chat package logic here
    return { items: [] }
  })

  // POST endpoint with body
  fastify.post<{ Body: { name: string } }>(
    '/my-feature',
    { preHandler: requireAuth },
    async (request) => {
      const { name } = request.body
      const userId = request.user!.id
      // Call core/chat package logic here
      return { id: '123', name }
    }
  )
}
```

## Step 2: Register in Server

Register the route in `apps/api/src/server.ts`.

```typescript
// apps/api/src/server.ts
import { myFeatureRoutes } from './routes/myFeature.js'

// Inside createServer function, after other route registrations:
await fastify.register(myFeatureRoutes, { prefix: '/api' })
```

## Step 3: Add to ApiClient Interface

Define the method signature in `packages/ui-vue/src/composables/useApi.ts`.

```typescript
// packages/ui-vue/src/composables/useApi.ts
export interface ApiClient {
  // ... existing methods

  // Add new method signatures
  getMyFeature(): Promise<MyFeatureResponse>
  createMyFeature(name: string): Promise<MyFeatureItem>
}
```

## Step 4: Implement HTTP Client

Add the implementation for the Web app in `apps/web/src/api/client.ts`.

```typescript
// apps/web/src/api/client.ts
export function createHttpApiClient(): ApiClient {
  const baseUrl = '/api'

  return {
    // ... existing implementations

    async getMyFeature() {
      const response = await fetch(`${baseUrl}/my-feature`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch')
      return response.json()
    },

    async createMyFeature(name: string) {
      const response = await fetch(`${baseUrl}/my-feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error('Failed to create')
      return response.json()
    },
  }
}
```

## Step 5: Implement IPC Client

Add the implementation for Electron renderer in `apps/electron/src/renderer/api/client.ts`.

```typescript
// apps/electron/src/renderer/api/client.ts
export function createIpcApiClient(): ApiClient {
  return {
    // ... existing implementations

    async getMyFeature() {
      return window.electronAPI.invoke('get-my-feature')
    },

    async createMyFeature(name: string) {
      return window.electronAPI.invoke('create-my-feature', name)
    },
  }
}
```

## Step 6: Add IPC Handler

Register handlers in the Electron main process at `apps/electron/src/main/ipc.ts`.

```typescript
// apps/electron/src/main/ipc.ts
import { ipcMain } from 'electron'

// Add handlers alongside existing ones
ipcMain.handle('get-my-feature', async (_event) => {
  // Call core/chat package logic directly (no HTTP needed)
  return { items: [] }
})

ipcMain.handle('create-my-feature', async (_event, name: string) => {
  // Call core/chat package logic directly
  return { id: '123', name }
})
```

## Testing

After implementing all steps:

1. Run `pnpm dev` and test the Web app at `http://localhost:3002`
2. Run `pnpm electron:dev` and test the Electron app
3. Verify both clients return the same data structure

## Summary

| Location | Purpose |
|----------|---------|
| `apps/api/src/routes/` | HTTP endpoint logic |
| `apps/api/src/server.ts` | Route registration |
| `packages/ui-vue/.../useApi.ts` | Interface contract |
| `apps/web/src/api/client.ts` | HTTP implementation |
| `apps/electron/src/renderer/api/client.ts` | IPC implementation |
| `apps/electron/src/main/ipc.ts` | IPC handlers |
