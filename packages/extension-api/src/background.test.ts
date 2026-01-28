/**
 * WorkerBackgroundTaskManager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkerBackgroundTaskManager, type WorkerBackgroundTaskManagerOptions } from './background.js'
import type { BackgroundTaskConfig, BackgroundTaskCallback } from './types.js'

describe('WorkerBackgroundTaskManager', () => {
  let manager: WorkerBackgroundTaskManager
  let sendTaskRegistered: ReturnType<typeof vi.fn>
  let sendTaskStatus: ReturnType<typeof vi.fn>
  let sendHealthReport: ReturnType<typeof vi.fn>
  let createLogAPI: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendTaskRegistered = vi.fn()
    sendTaskStatus = vi.fn()
    sendHealthReport = vi.fn()
    createLogAPI = vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }))

    const options: WorkerBackgroundTaskManagerOptions = {
      extensionId: 'test-extension',
      extensionVersion: '1.0.0',
      storagePath: '/fake/path',
      sendTaskRegistered,
      sendTaskStatus,
      sendHealthReport,
      createLogAPI,
    }

    manager = new WorkerBackgroundTaskManager(options)
  })

  describe('start', () => {
    it('should register a task and notify host', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }
      const callback = vi.fn()

      await manager.start(config, callback)

      expect(manager.hasTask('task-1')).toBe(true)
      expect(sendTaskRegistered).toHaveBeenCalledWith(
        'task-1',
        'Test Task',
        'user-1',
        { type: 'never' },
        undefined
      )
    })

    it('should throw error if task already exists', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      await manager.start(config, vi.fn())

      await expect(manager.start(config, vi.fn())).rejects.toThrow(
        "Background task with id 'task-1' is already registered"
      )
    })

    it('should return a disposable that stops the task', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      const disposable = await manager.start(config, vi.fn())
      disposable.dispose()

      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'stopped')
    })
  })

  describe('stop', () => {
    it('should abort running task and notify host', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }
      const callback = vi.fn(async ({ signal }) => {
        // Simulate long-running task
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 10000)
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      })

      await manager.start(config, callback)
      sendTaskStatus.mockClear()

      // Start the task
      const handlePromise = manager.handleStart('task-1')

      // Wait a bit for task to start
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Stop it
      manager.stop('task-1')

      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'stopped')

      // Wait for handleStart to complete
      await handlePromise
    })

    it('should do nothing if task does not exist', () => {
      manager.stop('non-existent')

      expect(sendTaskStatus).not.toHaveBeenCalled()
    })
  })

  describe('handleStart', () => {
    it('should execute task callback and notify host', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }
      const callback = vi.fn(async () => {
        // Task completes successfully
      })

      await manager.start(config, callback)
      sendTaskStatus.mockClear()

      await manager.handleStart('task-1')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'running')
      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'stopped')
    })

    it('should abort previous execution if already running', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      let firstAborted = false
      let secondCompleted = false

      const callback = vi.fn(async ({ signal }) => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            secondCompleted = true
            resolve()
          }, 100)

          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            firstAborted = true
            resolve()
          })
        })
      })

      await manager.start(config, callback)

      // Start first execution
      const firstPromise = manager.handleStart('task-1')

      // Start second execution before first completes - should abort first
      await new Promise((resolve) => setTimeout(resolve, 10))
      const secondPromise = manager.handleStart('task-1')

      await Promise.all([firstPromise, secondPromise])

      expect(callback).toHaveBeenCalledTimes(2)
      expect(firstAborted).toBe(true)
      expect(secondCompleted).toBe(true)
    })

    it('should handle task callback errors', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }
      const callback = vi.fn(async () => {
        throw new Error('Task failed')
      })

      await manager.start(config, callback)
      sendTaskStatus.mockClear()

      await manager.handleStart('task-1')

      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'running')
      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'failed', 'Task failed')
    })

    it('should detect aborted task', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      let wasAborted = false

      const callback = vi.fn(async ({ signal }) => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 100)
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            wasAborted = true
            resolve()
          })
        })
      })

      await manager.start(config, callback)
      sendTaskStatus.mockClear()

      const handlePromise = manager.handleStart('task-1')

      // Abort the task
      await new Promise((resolve) => setTimeout(resolve, 10))
      manager.stop('task-1')

      await handlePromise

      expect(wasAborted).toBe(true)
      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'stopped')
    })

    it('should do nothing if task does not exist', async () => {
      await manager.handleStart('non-existent')

      expect(sendTaskStatus).not.toHaveBeenCalled()
    })

    it('should provide correct execution context', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      let receivedContext: any = null

      const callback = vi.fn(async (context) => {
        receivedContext = context
      })

      await manager.start(config, callback)
      await manager.handleStart('task-1')

      expect(receivedContext).toBeDefined()
      expect(receivedContext.userId).toBe('user-1')
      expect(receivedContext.extension.id).toBe('test-extension')
      expect(receivedContext.extension.version).toBe('1.0.0')
      expect(receivedContext.extension.storagePath).toBe('/fake/path')
      expect(receivedContext.signal).toBeDefined()
      expect(receivedContext.reportHealth).toBeDefined()
      expect(receivedContext.log).toBeDefined()
    })
  })

  describe('handleStop', () => {
    it('should stop the task', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      await manager.start(config, vi.fn())
      sendTaskStatus.mockClear()

      manager.handleStop('task-1')

      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'stopped')
    })
  })

  describe('reportHealth', () => {
    it('should send health report to host', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      let reportHealthFn: any = null

      const callback = vi.fn(async (context) => {
        reportHealthFn = context.reportHealth
      })

      await manager.start(config, callback)
      await manager.handleStart('task-1')

      expect(reportHealthFn).toBeDefined()

      reportHealthFn('Processing 100 items...')

      expect(sendHealthReport).toHaveBeenCalledWith(
        'task-1',
        'Processing 100 items...',
        expect.any(String)
      )
    })
  })

  describe('getStatus', () => {
    it('should return status of all tasks', async () => {
      const config1: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task 1',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }
      const config2: BackgroundTaskConfig = {
        id: 'task-2',
        name: 'Test Task 2',
        userId: 'user-2',
        restartPolicy: { type: 'always' },
      }

      await manager.start(config1, vi.fn())
      await manager.start(config2, vi.fn())

      const statuses = manager.getStatus()

      expect(statuses).toHaveLength(2)
      expect(statuses.find((s) => s.taskId === 'task-1')).toMatchObject({
        taskId: 'task-1',
        name: 'Test Task 1',
        userId: 'user-1',
        status: 'pending',
        restartCount: 0,
      })
      expect(statuses.find((s) => s.taskId === 'task-2')).toMatchObject({
        taskId: 'task-2',
        name: 'Test Task 2',
        userId: 'user-2',
        status: 'pending',
        restartCount: 0,
      })
    })
  })

  describe('dispose', () => {
    it('should abort all running tasks', async () => {
      const config1: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task 1',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }
      const config2: BackgroundTaskConfig = {
        id: 'task-2',
        name: 'Test Task 2',
        userId: 'user-2',
        restartPolicy: { type: 'never' },
      }

      let task1Aborted = false
      let task2Aborted = false

      const callback1 = vi.fn(async ({ signal }) => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1000)
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            task1Aborted = true
            resolve()
          })
        })
      })

      const callback2 = vi.fn(async ({ signal }) => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1000)
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            task2Aborted = true
            resolve()
          })
        })
      })

      await manager.start(config1, callback1)
      await manager.start(config2, callback2)

      const promise1 = manager.handleStart('task-1')
      const promise2 = manager.handleStart('task-2')

      await new Promise((resolve) => setTimeout(resolve, 10))

      manager.dispose()

      await Promise.all([promise1, promise2])

      expect(task1Aborted).toBe(true)
      expect(task2Aborted).toBe(true)
      expect(manager.getStatus()).toHaveLength(0)
    })
  })

  describe('race condition scenarios', () => {
    it('should handle dispose while task is running', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      let disposed = false

      const callback = vi.fn(async ({ signal }) => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 100)
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            disposed = true
            resolve()
          })
        })
      })

      const disposable = await manager.start(config, callback)
      const handlePromise = manager.handleStart('task-1')

      // Dispose while running
      await new Promise((resolve) => setTimeout(resolve, 10))
      disposable.dispose()

      await handlePromise

      expect(disposed).toBe(true)
    })

    it('should handle stop before task starts', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      await manager.start(config, vi.fn())

      // Stop before handleStart is called
      manager.stop('task-1')
      sendTaskStatus.mockClear()

      // Now start it
      await manager.handleStart('task-1')

      // Should immediately detect it's aborted
      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'running')
      expect(sendTaskStatus).toHaveBeenCalledWith('task-1', 'stopped')
    })

    it('should handle multiple rapid start/stop cycles', async () => {
      const config: BackgroundTaskConfig = {
        id: 'task-1',
        name: 'Test Task',
        userId: 'user-1',
        restartPolicy: { type: 'never' },
      }

      const callback = vi.fn(async ({ signal }) => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 50)
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      })

      await manager.start(config, callback)

      // Rapidly start and stop
      const promises: Promise<void>[] = []
      for (let i = 0; i < 5; i++) {
        promises.push(manager.handleStart('task-1'))
        await new Promise((resolve) => setTimeout(resolve, 5))
        manager.stop('task-1')
        await new Promise((resolve) => setTimeout(resolve, 5))
      }

      await Promise.all(promises)

      // Should have handled all starts
      expect(callback).toHaveBeenCalledTimes(5)
    })
  })
})
