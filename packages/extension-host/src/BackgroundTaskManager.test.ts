/**
 * BackgroundTaskManager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BackgroundTaskManager, type BackgroundTaskManagerOptions } from './BackgroundTaskManager.js'

describe('BackgroundTaskManager', () => {
  let manager: BackgroundTaskManager
  let sendStartTask: ReturnType<typeof vi.fn>
  let sendStopTask: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    sendStartTask = vi.fn()
    sendStopTask = vi.fn()

    const options: BackgroundTaskManagerOptions = {
      sendStartTask,
      sendStopTask,
    }

    manager = new BackgroundTaskManager(options)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('registerTask', () => {
    it('should register a task and immediately start it', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'always' })

      expect(sendStartTask).toHaveBeenCalledWith('ext-1', 'task-1')
      expect(manager.getTask('ext-1', 'task-1')).toBeDefined()
      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('running')
    })

    it('should not register a task if it already exists', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'always' })
      manager.registerTask('ext-1', 'task-1', 'Test Task 2', 'user-1', { type: 'always' })

      expect(sendStartTask).toHaveBeenCalledTimes(1)
    })

    it('should use default restart policy values', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'on-failure' })

      const task = manager.getTask('ext-1', 'task-1')
      expect(task?.restartPolicy).toEqual({
        type: 'on-failure',
        maxRestarts: 0,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
      })
    })
  })

  describe('handleTaskStatus', () => {
    it('should update task status to running', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      manager.handleTaskStatus('ext-1', 'task-1', 'running')

      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('running')
    })

    it('should update task status to stopped', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      manager.handleTaskStatus('ext-1', 'task-1', 'stopped')

      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('stopped')
    })

    it('should update task status to failed with error', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Something went wrong')

      const task = manager.getTask('ext-1', 'task-1')
      expect(task?.status).toBe('failed')
      expect(task?.error).toBe('Something went wrong')
    })
  })

  describe('restart policy: never', () => {
    it('should not restart on failure', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')

      vi.advanceTimersByTime(10000)
      expect(sendStartTask).not.toHaveBeenCalled()
    })

    it('should not restart on stop', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'stopped')

      vi.advanceTimersByTime(10000)
      expect(sendStartTask).not.toHaveBeenCalled()
    })
  })

  describe('restart policy: on-failure', () => {
    it('should restart on failure', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'on-failure',
        initialDelayMs: 1000,
      })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')

      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('restarting')
      expect(sendStartTask).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      expect(sendStartTask).toHaveBeenCalledWith('ext-1', 'task-1')
    })

    it('should not restart on stop', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'on-failure' })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'stopped')

      vi.advanceTimersByTime(10000)
      expect(sendStartTask).not.toHaveBeenCalled()
    })
  })

  describe('restart policy: always', () => {
    it('should restart on failure', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
      })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')

      vi.advanceTimersByTime(1000)
      expect(sendStartTask).toHaveBeenCalledWith('ext-1', 'task-1')
    })

    it('should restart on stop', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
      })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'stopped')

      vi.advanceTimersByTime(1000)
      expect(sendStartTask).toHaveBeenCalledWith('ext-1', 'task-1')
    })
  })

  describe('exponential backoff', () => {
    it('should use exponential backoff for restarts', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
      })
      sendStartTask.mockClear()

      // First failure: delay = 1000ms
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 1')
      vi.advanceTimersByTime(999)
      expect(sendStartTask).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(sendStartTask).toHaveBeenCalledTimes(1)

      // Second failure: delay = 2000ms
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 2')
      vi.advanceTimersByTime(1999)
      expect(sendStartTask).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(sendStartTask).toHaveBeenCalledTimes(2)

      // Third failure: delay = 4000ms
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 3')
      vi.advanceTimersByTime(3999)
      expect(sendStartTask).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(1)
      expect(sendStartTask).toHaveBeenCalledTimes(3)
    })

    it('should cap delay at maxDelayMs', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 10,
      })
      sendStartTask.mockClear()

      // First failure: delay = 1000ms
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 1')
      vi.advanceTimersByTime(1000)
      expect(sendStartTask).toHaveBeenCalledTimes(1)

      // Second failure: delay would be 10000ms but capped at 5000ms
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 2')
      vi.advanceTimersByTime(4999)
      expect(sendStartTask).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(sendStartTask).toHaveBeenCalledTimes(2)
    })

    it('should increment restart count', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 100,
      })

      expect(manager.getTask('ext-1', 'task-1')?.restartCount).toBe(0)

      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')
      expect(manager.getTask('ext-1', 'task-1')?.restartCount).toBe(1)

      vi.advanceTimersByTime(100)
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')
      expect(manager.getTask('ext-1', 'task-1')?.restartCount).toBe(2)
    })
  })

  describe('max restarts', () => {
    it('should stop restarting after maxRestarts', () => {
      const exhaustedHandler = vi.fn()
      manager.on('task-exhausted', exhaustedHandler)

      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        maxRestarts: 2,
        initialDelayMs: 100,
      })
      sendStartTask.mockClear()

      // First failure - restartCount becomes 1
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 1')
      vi.advanceTimersByTime(100)
      expect(sendStartTask).toHaveBeenCalledTimes(1)

      // Second failure - restartCount becomes 2, reaches maxRestarts
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 2')
      vi.advanceTimersByTime(200) // Account for backoff (100 * 2^1)
      expect(sendStartTask).toHaveBeenCalledTimes(2)

      // Third failure - should not restart, maxRestarts reached
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error 3')
      vi.advanceTimersByTime(10000)
      expect(sendStartTask).toHaveBeenCalledTimes(2) // Should not restart again
      expect(exhaustedHandler).toHaveBeenCalledWith('ext-1', 'task-1', 2)
      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('failed')
    })

    it('should allow unlimited restarts when maxRestarts is 0', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        maxRestarts: 0,
        initialDelayMs: 100,
      })
      sendStartTask.mockClear()

      // Simulate many failures
      for (let i = 0; i < 10; i++) {
        manager.handleTaskStatus('ext-1', 'task-1', 'failed', `Error ${i}`)
        vi.advanceTimersByTime(100 * Math.pow(2, i)) // Account for backoff
      }

      expect(sendStartTask).toHaveBeenCalledTimes(10)
      expect(manager.getTask('ext-1', 'task-1')?.restartCount).toBe(10)
    })
  })

  describe('stopTask', () => {
    it('should send stop message to worker', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'always' })
      manager.stopTask('ext-1', 'task-1')

      expect(sendStopTask).toHaveBeenCalledWith('ext-1', 'task-1')
    })

    it('should cancel pending restart timer', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
      })
      sendStartTask.mockClear()

      // Trigger a restart
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')
      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('restarting')

      // Stop the task before restart timer fires
      manager.stopTask('ext-1', 'task-1')
      expect(manager.getTask('ext-1', 'task-1')?.status).toBe('stopped')

      // Advance time - should not restart
      vi.advanceTimersByTime(2000)
      expect(sendStartTask).not.toHaveBeenCalled()
    })
  })

  describe('unregisterTask', () => {
    it('should remove task from manager', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'always' })
      manager.unregisterTask('ext-1', 'task-1')

      expect(manager.getTask('ext-1', 'task-1')).toBeUndefined()
    })

    it('should cancel pending restart timer', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
      })
      sendStartTask.mockClear()

      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')
      manager.unregisterTask('ext-1', 'task-1')

      vi.advanceTimersByTime(2000)
      expect(sendStartTask).not.toHaveBeenCalled()
    })
  })

  describe('unregisterAllForExtension', () => {
    it('should remove all tasks for an extension', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task 1', 'user-1', { type: 'always' })
      manager.registerTask('ext-1', 'task-2', 'Test Task 2', 'user-1', { type: 'always' })
      manager.registerTask('ext-2', 'task-3', 'Test Task 3', 'user-1', { type: 'always' })

      manager.unregisterAllForExtension('ext-1')

      expect(manager.getTask('ext-1', 'task-1')).toBeUndefined()
      expect(manager.getTask('ext-1', 'task-2')).toBeUndefined()
      expect(manager.getTask('ext-2', 'task-3')).toBeDefined()
    })
  })

  describe('getTasksForExtension', () => {
    it('should return all tasks for an extension', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task 1', 'user-1', { type: 'always' })
      manager.registerTask('ext-1', 'task-2', 'Test Task 2', 'user-1', { type: 'always' })
      manager.registerTask('ext-2', 'task-3', 'Test Task 3', 'user-1', { type: 'always' })

      const tasks = manager.getTasksForExtension('ext-1')
      expect(tasks).toHaveLength(2)
      expect(tasks.map((t) => t.taskId).sort()).toEqual(['task-1', 'task-2'])
    })
  })

  describe('getAllTasks', () => {
    it('should return all tasks', () => {
      manager.registerTask('ext-1', 'task-1', 'Test Task 1', 'user-1', { type: 'always' })
      manager.registerTask('ext-2', 'task-2', 'Test Task 2', 'user-2', { type: 'always' })

      const tasks = manager.getAllTasks()
      expect(tasks).toHaveLength(2)
    })
  })

  describe('events', () => {
    it('should emit task-started on registration', () => {
      const handler = vi.fn()
      manager.on('task-started', handler)

      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'always' })

      expect(handler).toHaveBeenCalledWith('ext-1', 'task-1')
    })

    it('should emit task-stopped on stop', () => {
      const handler = vi.fn()
      manager.on('task-stopped', handler)

      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      manager.handleTaskStatus('ext-1', 'task-1', 'stopped')

      expect(handler).toHaveBeenCalledWith('ext-1', 'task-1')
    })

    it('should emit task-failed on failure', () => {
      const handler = vi.fn()
      manager.on('task-failed', handler)

      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'never' })
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Something went wrong')

      expect(handler).toHaveBeenCalledWith('ext-1', 'task-1', 'Something went wrong')
    })

    it('should emit task-restarting on scheduled restart', () => {
      const handler = vi.fn()
      manager.on('task-restarting', handler)

      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', {
        type: 'always',
        initialDelayMs: 1000,
      })
      manager.handleTaskStatus('ext-1', 'task-1', 'failed', 'Error')

      expect(handler).toHaveBeenCalledWith('ext-1', 'task-1', 1, 1000)
    })
  })

  describe('handleHealthReport', () => {
    it('should update task health status', () => {
      const handler = vi.fn()
      manager.on('task-health', handler)

      manager.registerTask('ext-1', 'task-1', 'Test Task', 'user-1', { type: 'always' })
      manager.handleHealthReport('ext-1', 'task-1', 'Processing messages...', '2024-01-15T10:00:00Z')

      const task = manager.getTask('ext-1', 'task-1')
      expect(task?.lastHealthStatus).toBe('Processing messages...')
      expect(task?.lastHealthTime).toBe('2024-01-15T10:00:00Z')
      expect(handler).toHaveBeenCalledWith('ext-1', 'task-1', 'Processing messages...')
    })
  })
})
