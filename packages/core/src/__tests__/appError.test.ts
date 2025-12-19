import { describe, it, expect } from 'vitest'
import { AppError, ErrorCode, ok, err } from '../errors/AppError.js'
import type { Result } from '../errors/AppError.js'

describe('AppError', () => {
  it('should create an error with code and message', () => {
    const error = new AppError(ErrorCode.THEME_NOT_FOUND, 'Theme not found')

    expect(error.code).toBe(ErrorCode.THEME_NOT_FOUND)
    expect(error.message).toBe('Theme not found')
    expect(error.name).toBe('AppError')
  })

  it('should include context', () => {
    const error = new AppError(ErrorCode.THEME_NOT_FOUND, 'Theme not found', {
      themeId: 'my-theme',
    })

    expect(error.context).toEqual({ themeId: 'my-theme' })
  })

  it('should include cause', () => {
    const cause = new Error('Original error')
    const error = new AppError(ErrorCode.DB_QUERY_FAILED, 'Query failed', undefined, cause)

    expect(error.cause).toBe(cause)
  })

  it('should serialize to JSON', () => {
    const error = new AppError(ErrorCode.VALIDATION_INVALID, 'Invalid input', {
      field: 'email',
    })

    const json = error.toJSON()

    expect(json).toEqual({
      code: ErrorCode.VALIDATION_INVALID,
      message: 'Invalid input',
      context: { field: 'email' },
    })
  })
})

describe('Result', () => {
  it('should create a successful result with ok()', () => {
    const result = ok(42)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(42)
    }
  })

  it('should create a failed result with err()', () => {
    const error = new AppError(ErrorCode.UNKNOWN, 'Something went wrong')
    const result = err(error)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(error)
    }
  })

  it('should work with type narrowing', () => {
    function divide(a: number, b: number): Result<number> {
      if (b === 0) {
        return err(new AppError(ErrorCode.VALIDATION_INVALID, 'Cannot divide by zero'))
      }
      return ok(a / b)
    }

    const successResult = divide(10, 2)
    expect(successResult.ok).toBe(true)
    if (successResult.ok) {
      expect(successResult.value).toBe(5)
    }

    const failResult = divide(10, 0)
    expect(failResult.ok).toBe(false)
    if (!failResult.ok) {
      expect(failResult.error.code).toBe(ErrorCode.VALIDATION_INVALID)
    }
  })
})
