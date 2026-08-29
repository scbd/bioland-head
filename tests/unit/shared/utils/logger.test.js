import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureLogger } from '../../../../shared/utils/logger'
import { LOG_LEVEL } from '../../../../shared/utils/constants'
import consola from 'consola'

describe('Logger Configuration', () => {
  beforeEach(() => {
    // Reset consola level before each test
    consola.level = LOG_LEVEL.TRACE
  })

  describe('configureLogger', () => {
    it('should set log level from numeric value', () => {
      const result = configureLogger(LOG_LEVEL.WARN)
      
      expect(consola.level).toBe(1)
      expect(result).toBe(consola)
    })

    it('should set log level from string value - FATAL', () => {
      configureLogger('FATAL')
      expect(consola.level).toBe(LOG_LEVEL.FATAL)
      expect(consola.level).toBe(0)
    })

    it('should set log level from string value - WARN', () => {
      configureLogger('WARN')
      expect(consola.level).toBe(LOG_LEVEL.WARN)
      expect(consola.level).toBe(1)
    })

    it('should set log level from string value - LOG', () => {
      configureLogger('LOG')
      expect(consola.level).toBe(LOG_LEVEL.LOG)
      expect(consola.level).toBe(2)
    })

    it('should set log level from string value - INFO', () => {
      configureLogger('INFO')
      expect(consola.level).toBe(LOG_LEVEL.INFO)
      expect(consola.level).toBe(3)
    })

    it('should set log level from string value - DEBUG', () => {
      configureLogger('DEBUG')
      expect(consola.level).toBe(LOG_LEVEL.DEBUG)
      expect(consola.level).toBe(4)
    })

    it('should set log level from string value - TRACE', () => {
      configureLogger('TRACE')
      expect(consola.level).toBe(LOG_LEVEL.TRACE)
      expect(consola.level).toBe(5)
    })

    it('should handle lowercase string values', () => {
      configureLogger('warn')
      expect(consola.level).toBe(LOG_LEVEL.WARN)
    })

    it('should handle mixed case string values', () => {
      configureLogger('WaRn')
      expect(consola.level).toBe(LOG_LEVEL.WARN)
    })

    it('should trim whitespace from string values', () => {
      configureLogger('  WARN  ')
      expect(consola.level).toBe(LOG_LEVEL.WARN)
    })

    it('should use default level for invalid string', () => {
      configureLogger('INVALID')
      expect(consola.level).toBe(LOG_LEVEL.TRACE)
    })

    it('should use default level for undefined', () => {
      configureLogger(undefined)
      expect(consola.level).toBe(LOG_LEVEL.TRACE)
    })

    it('should use default level for null', () => {
      configureLogger(null)
      expect(consola.level).toBe(LOG_LEVEL.TRACE)
    })

    it('should use default level for negative numbers', () => {
      configureLogger(-1)
      expect(consola.level).toBe(LOG_LEVEL.TRACE)
    })

    it('should accept zero as valid log level', () => {
      configureLogger(0)
      expect(consola.level).toBe(0)
    })

    it('should return consola instance', () => {
      const result = configureLogger(LOG_LEVEL.WARN)
      expect(result).toBe(consola)
    })
  })

  describe('production default level', () => {
    it('should default to INFO when NODE_ENV is production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()

      const { configureLogger: configureProdLogger } = await import('../../../../shared/utils/logger')
      const logger = configureProdLogger(undefined)

      expect(logger.level).toBe(LOG_LEVEL.INFO)

      vi.unstubAllEnvs()
      vi.resetModules()
    })
  })

  describe('LOG_LEVEL constants', () => {
    it('should have correct numeric values', () => {
      expect(LOG_LEVEL.FATAL).toBe(0)
      expect(LOG_LEVEL.WARN).toBe(1)
      expect(LOG_LEVEL.LOG).toBe(2)
      expect(LOG_LEVEL.INFO).toBe(3)
      expect(LOG_LEVEL.DEBUG).toBe(4)
      expect(LOG_LEVEL.TRACE).toBe(5)
    })
  })
})
