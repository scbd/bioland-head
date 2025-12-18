import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

// Mock Nuxt auto-imports
global.defineStore = defineStore

// Import store after mocking
const { useAlertStore } = await import('~/stores/alerts.js')

describe('useAlertStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('State Initialization', () => {
    it('should initialize with empty alerts array', () => {
      const store = useAlertStore()
      expect(store.alerts).toEqual([])
      expect(Array.isArray(store.alerts)).toBe(true)
    })

    it('should initialize with empty noRepeat array', () => {
      const store = useAlertStore()
      expect(store.noRepeat).toEqual([])
      expect(Array.isArray(store.noRepeat)).toBe(true)
    })
  })

  describe('addAlert action', () => {
    it('should add alert with generated ID when no ID provided', () => {
      const store = useAlertStore()
      const alert = { message: 'Test alert' }
      
      store.addAlert(alert)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].id).toBeDefined()
      expect(store.alerts[0].message).toBe('Test alert')
    })

    it('should use provided ID if exists', () => {
      const store = useAlertStore()
      const alert = { id: 'custom-id', message: 'Test alert' }
      
      store.addAlert(alert)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].id).toBe('custom-id')
    })

    it('should set default type to info', () => {
      const store = useAlertStore()
      const alert = { message: 'Test alert' }
      
      store.addAlert(alert)
      
      expect(store.alerts[0].type).toBe('info')
    })

    it('should use provided type if exists', () => {
      const store = useAlertStore()
      const alert = { type: 'warning', message: 'Test alert' }
      
      store.addAlert(alert)
      
      expect(store.alerts[0].type).toBe('warning')
    })

    it('should override default type with second parameter', () => {
      const store = useAlertStore()
      const alert = { message: 'Test alert' }
      
      store.addAlert(alert, 'error')
      
      expect(store.alerts[0].type).toBe('error')
    })

    it('should add multiple alerts', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      store.addAlert({ message: 'Alert 2' })
      store.addAlert({ message: 'Alert 3' })
      
      expect(store.alerts).toHaveLength(3)
    })
  })

  describe('addInfo action', () => {
    it('should add info type alert', () => {
      const store = useAlertStore()
      const alert = { message: 'Info alert' }
      
      store.addInfo(alert)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].type).toBe('info')
      expect(store.alerts[0].message).toBe('Info alert')
    })
  })

  describe('addError action', () => {
    it('should add error type alert', () => {
      const store = useAlertStore()
      const alert = { message: 'Error alert' }
      
      store.addError(alert)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].type).toBe('error')
      expect(store.alerts[0].message).toBe('Error alert')
    })
  })

  describe('addSuccess action', () => {
    it('should add success type alert', () => {
      const store = useAlertStore()
      const alert = { message: 'Success alert' }
      
      store.addSuccess(alert)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].type).toBe('success')
      expect(store.alerts[0].message).toBe('Success alert')
    })
  })

  describe('addWarning action', () => {
    it('should add warning type alert', () => {
      const store = useAlertStore()
      const alert = { message: 'Warning alert' }
      
      store.addWarning(alert)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].type).toBe('warning')
      expect(store.alerts[0].message).toBe('Warning alert')
    })
  })

  describe('clearAlert action', () => {
    it('should remove alert at specified index', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      store.addAlert({ message: 'Alert 2' })
      store.addAlert({ message: 'Alert 3' })
      
      store.clearAlert(1)
      
      expect(store.alerts).toHaveLength(2)
      expect(store.alerts[0].message).toBe('Alert 1')
      expect(store.alerts[1].message).toBe('Alert 3')
    })

    it('should handle clearing first alert', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      store.addAlert({ message: 'Alert 2' })
      
      store.clearAlert(0)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].message).toBe('Alert 2')
    })

    it('should handle clearing last alert', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      store.addAlert({ message: 'Alert 2' })
      
      store.clearAlert(1)
      
      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].message).toBe('Alert 1')
    })
  })

  describe('clearAll action', () => {
    it('should clear all alerts', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      store.addAlert({ message: 'Alert 2' })
      store.addAlert({ message: 'Alert 3' })
      
      store.clearAll()
      
      expect(store.alerts).toHaveLength(0)
    })

    it('should work on empty alerts array', () => {
      const store = useAlertStore()
      
      store.clearAll()
      
      expect(store.alerts).toHaveLength(0)
    })
  })

  describe('doNotRepeat action', () => {
    it('should add ID to noRepeat array', () => {
      const store = useAlertStore()
      
      store.doNotRepeat('test-id')
      
      expect(store.noRepeat).toHaveLength(1)
      expect(store.noRepeat[0]).toBe('test-id')
    })

    it('should add multiple IDs to noRepeat array', () => {
      const store = useAlertStore()
      
      store.doNotRepeat('id-1')
      store.doNotRepeat('id-2')
      store.doNotRepeat('id-3')
      
      expect(store.noRepeat).toHaveLength(3)
      expect(store.noRepeat).toEqual(['id-1', 'id-2', 'id-3'])
    })
  })

  describe('hasAlert getter', () => {
    it('should return 0 when no alerts', () => {
      const store = useAlertStore()
      
      expect(store.hasAlert).toBe(0)
    })

    it('should return correct count of alerts', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      expect(store.hasAlert).toBe(1)
      
      store.addAlert({ message: 'Alert 2' })
      expect(store.hasAlert).toBe(2)
      
      store.addAlert({ message: 'Alert 3' })
      expect(store.hasAlert).toBe(3)
    })

    it('should update when alerts are cleared', () => {
      const store = useAlertStore()
      
      store.addAlert({ message: 'Alert 1' })
      store.addAlert({ message: 'Alert 2' })
      expect(store.hasAlert).toBe(2)
      
      store.clearAlert(0)
      expect(store.hasAlert).toBe(1)
      
      store.clearAll()
      expect(store.hasAlert).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle alert with all properties', () => {
      const store = useAlertStore()
      const alert = {
        id: 'custom-id',
        type: 'success',
        message: 'Complete alert',
        title: 'Title',
        timeout: 5000,
      }
      
      store.addAlert(alert)
      
      expect(store.alerts[0]).toMatchObject(alert)
    })

    it('should not prevent duplicate IDs in noRepeat', () => {
      const store = useAlertStore()
      
      store.doNotRepeat('same-id')
      store.doNotRepeat('same-id')
      
      expect(store.noRepeat).toHaveLength(2)
      expect(store.noRepeat).toEqual(['same-id', 'same-id'])
    })
  })
})
