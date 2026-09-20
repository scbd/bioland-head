import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'

import {
  MAX_PHASES,
  beginTiming,
  formatServerTiming,
  formatTimingLog,
  getTiming,
  isTimedPath,
  loggedPath,
  recordPhase,
  timePhase,
  totalMs,
} from '~/server/utils/request-timing'

const anEvent = () => ({ context: {} }) as unknown as H3Event

describe('request timing collector (BL-1069)', () => {
  it('starts a timeline on the event context', () => {
    const event = anEvent()

    const state = beginTiming(event, 100)

    expect(state).toEqual({ startedAt: 100, phases: [] })
    expect(getTiming(event)).toBe(state)
  })

  it('keeps the first start when a request is begun twice', () => {
    const event = anEvent()

    beginTiming(event, 100)

    expect(beginTiming(event, 500)?.startedAt).toBe(100)
  })

  it('tolerates an event with no context rather than throwing mid-request', () => {
    expect(beginTiming(undefined as unknown as H3Event)).toBeUndefined()
    expect(getTiming(undefined)).toBeUndefined()
    expect(() => recordPhase(undefined, 'ctx', 5)).not.toThrow()
  })

  it('drops phases for a request that was never started', () => {
    const event = anEvent()

    recordPhase(event, 'ctx', 5)

    expect(getTiming(event)).toBeUndefined()
  })

  it('records a phase, rounded to a tenth of a millisecond', () => {
    const event = anEvent()
    beginTiming(event, 0)

    recordPhase(event, 'dmsm', 12.3456)

    expect(getTiming(event)?.phases).toEqual([{ name: 'dmsm', ms: 12.3 }])
  })

  it('ignores a non-finite duration', () => {
    const event = anEvent()
    beginTiming(event, 0)

    recordPhase(event, 'dmsm', Number.NaN)
    recordPhase(event, 'dmsm', Number.POSITIVE_INFINITY)

    expect(getTiming(event)?.phases).toEqual([])
  })

  it('stops collecting past MAX_PHASES so a loop cannot grow the header unbounded', () => {
    const event = anEvent()
    beginTiming(event, 0)

    for (let i = 0; i < MAX_PHASES + 10; i++) recordPhase(event, `p${i}`, 1)

    expect(getTiming(event)?.phases).toHaveLength(MAX_PHASES)
  })

  it('times an awaited leg and returns its value', async () => {
    const event = anEvent()
    beginTiming(event, 0)

    const value = await timePhase(event, 'ctx', async () => 'resolved')

    expect(value).toBe('resolved')
    expect(getTiming(event)?.phases[0]?.name).toBe('ctx')
    expect(getTiming(event)?.phases[0]?.ms).toBeGreaterThanOrEqual(0)
  })

  it('records a phase that rejected - a slow failure is the interesting case', async () => {
    const event = anEvent()
    beginTiming(event, 0)

    await expect(timePhase(event, 'dmsm', async () => { throw new Error('DMSM down') })).rejects.toThrow('DMSM down')

    expect(getTiming(event)?.phases.map((p) => p.name)).toEqual(['dmsm'])
  })

  it('formats a Server-Timing header with every phase and a total', () => {
    const event = anEvent()
    const state = beginTiming(event, 0)!
    recordPhase(event, 'ctx', 12.4)
    recordPhase(event, 'dmsm', 430.1)

    expect(formatServerTiming(state, 8430)).toBe('ctx;dur=12.4, dmsm;dur=430.1, total;dur=8430')
  })

  it('reduces a phase name to a Server-Timing token', () => {
    const event = anEvent()
    const state = beginTiming(event, 0)!
    recordPhase(event, 'drupal settings; x', 1)

    expect(formatServerTiming(state, 1)).toBe('drupal_settings__x;dur=1, total;dur=1')
  })

  it('formats a readable log line', () => {
    const event = anEvent()
    const state = beginTiming(event, 0)!
    recordPhase(event, 'ctx', 12.4)

    expect(formatTimingLog(state, 8430.25)).toBe('total=8430.3ms ctx=12.4ms')
  })

  it('reports the elapsed total from the start mark', () => {
    const event = anEvent()
    const state = beginTiming(event, 1000)!

    expect(totalMs(state, 9430)).toBe(8430)
  })

  it.each(['/_nuxt/entry.js', '/_ipx/w_100/x.png', '/_i18n/en.json', '/__nuxt/x', '/fonts/a.woff2', '/favicon.ico', '/.well-known/x'])(
    'does not time %s',
    (path) => expect(isTimedPath(path)).toBe(false),
  )

  it.each(['/en', '/en/news/abc', '/api/page/x/y', '/api/menus'])('times %s', (path) => expect(isTimedPath(path)).toBe(true))

  it('logs a path without its query string - SSR fetches carry the whole site context there', () => {
    expect(loggedPath('/api/page/bl2-be-%2Fen/%2Fen?siteCode=be&locale=en')).toBe('/api/page/bl2-be-%2Fen/%2Fen')
    expect(loggedPath('/en')).toBe('/en')
    expect(loggedPath(undefined)).toBe('/')
  })

  it('does not time a request with no path', () => {
    expect(isTimedPath(undefined)).toBe(false)
    expect(isTimedPath('')).toBe(false)
  })
})
