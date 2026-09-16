import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'

// Static assertions over server/assets/schema.sql. These stand in for applying
// the migration, which needs a live MariaDB the unit suite does not have.

let schema = ''
/** The registry half of the file, from its banner to EOF. */
let registrySection = ''
/** Registry section with `--` comment lines stripped — the actual DDL. */
let registryDdl = ''
/** Every declared column name in the registry section. */
let registryColumnNames: string[] = []

const COLUMN_LINE = /^([a-z_]+) (VARCHAR|TEXT|JSON|TINYINT|BIGINT|CHAR|TIMESTAMP)/

beforeAll(async () => {
  schema = await readFile(new URL('../../../../../server/assets/schema.sql', import.meta.url), 'utf8')

  const start = schema.indexOf('-- Site configuration registry (BL-981')
  expect(start).toBeGreaterThan(-1)
  registrySection = schema.slice(start)

  registryDdl = registrySection
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')

  registryColumnNames = registryDdl
    .split('\n')
    .map(line => line.trim().match(COLUMN_LINE)?.[1])
    .filter((name): name is string => Boolean(name))
})

describe('schema.sql — registry placement', () => {
  it('creates the tables in their own site_registry database (ADR 0008)', () => {
    expect(registryDdl).toMatch(/CREATE DATABASE IF NOT EXISTS site_registry/)

    for (const table of ['multi_site_config', 'site_config', 'network_summary']) {
      expect(registryDdl).toContain(`CREATE TABLE IF NOT EXISTS site_registry.${table}`)
    }
  })

  it('does not move the registry into the i18n_cache database', () => {
    // The only `USE` in the file is the pre-existing translation-cache one, and
    // every registry table is qualified, so the `USE` cannot capture them.
    expect(registryDdl).not.toMatch(/^\s*USE\s/m)
    expect(registryDdl).not.toMatch(/CREATE TABLE IF NOT EXISTS i18n_cache\./)
  })
})

describe('schema.sql — idempotency', () => {
  it('makes every registry statement a no-op on a second run', () => {
    const creates = registryDdl.match(/CREATE\s+(?:DATABASE|TABLE|VIEW|INDEX)[^\n]*/gi) ?? []

    expect(creates.length).toBeGreaterThan(0)
    for (const statement of creates) {
      expect(statement).toMatch(/IF NOT EXISTS|OR REPLACE/i)
    }
  })

  it('adds no ALTER or DROP that would make a re-run destructive', () => {
    expect(registryDdl).not.toMatch(/\bALTER\s+TABLE\b/i)
    expect(registryDdl).not.toMatch(/\bDROP\b/i)
  })
})

describe('schema.sql — no secret-bearing column exists', () => {
  const forbidden = [
    'dataBase',
    'data_base',
    'dns',
    'drupal',
    'defaultSmtpCredentials',
    'default_smtp_credentials',
    'smtpCredentials',
    'smtp_credentials',
    'panoramaKey',
    'panorama_key',
    'hostZoneId',
    'host_zone_id',
    'apiUserPass',
    'api_user_pass',
    'password',
    'secret',
    'token',
  ]

  it('declares no column named after any secret-bearing config key', () => {
    // Checked against declared COLUMN NAMES, not the raw text: the mandated
    // prohibition block and several column comments name these keys in prose,
    // and naming them there is the documentation, not a leak. What matters is
    // that no column exists to hold one.
    expect(registryColumnNames.length).toBeGreaterThan(30)

    for (const name of forbidden) {
      const hit = registryColumnNames.find(column => column.includes(name.toLowerCase()))
      expect(hit, `forbidden column ${name}`).toBeUndefined()
    }
  })

  it('declares no bare `meta` column at either level', () => {
    expect(registryColumnNames).not.toContain('meta')
  })

  it('carries the comment block saying what must never be stored and why', () => {
    expect(registrySection).toMatch(/WHAT MUST NEVER BE STORED HERE/)
    expect(registrySection).toMatch(/panoramaKey/)
    expect(registrySection).toMatch(/A\n?--? ?column that cannot hold a secret cannot leak one/s)
  })
})

describe('schema.sql — modelled artifacts', () => {
  it('keys both config levels on env and multi_site_code', () => {
    expect(registryDdl).toMatch(/PRIMARY KEY \(env, multi_site_code\)/)
    expect(registryDdl).toMatch(/PRIMARY KEY \(env, multi_site_code, site_code\)/)
  })

  it('models the two-level theme', () => {
    const multiSite = registryDdl.slice(
      registryDdl.indexOf('site_registry.multi_site_config'),
      registryDdl.indexOf('site_registry.site_config'),
    )
    expect(multiSite).toMatch(/^\s*theme JSON NULL/m)
    expect(registryDdl).toMatch(/^\s*theme JSON NULL COMMENT 'Per-site theme OVERRIDE/m)
  })

  it('keeps the colliding i18n shapes in separately named columns', () => {
    expect(registryDdl).toMatch(/^\s*i18n JSON NULL/m)
    expect(registryDdl).toMatch(/^\s*i18n_enabled TINYINT\(1\) NULL/m)
  })

  it('carries the generation and drift-hash columns at both levels', () => {
    expect(registryDdl.match(/config_generation BIGINT UNSIGNED NOT NULL DEFAULT 0/g))
      .toHaveLength(2)
    expect(registryDdl.match(/source_hash CHAR\(64\) NULL/g)).toHaveLength(2)
  })

  it('carries the last-known-good settings column', () => {
    expect(registryDdl).toMatch(/last_known_good_settings JSON NULL/)
    expect(registryDdl).toMatch(/last_known_good_at TIMESTAMP NULL/)
  })

  it('creates the network summary table with exactly the five published fields (C20)', () => {
    // network_summary is the last statement in the file, so the section from its
    // header to EOF is exactly that table.
    const table = registryDdl.slice(registryDdl.indexOf('site_registry.network_summary'))
    const columns = table
      .split('\n')
      .map(line => line.trim().match(COLUMN_LINE)?.[1])
      .filter(Boolean)

    expect(columns).toEqual([
      'env', 'multi_site_code', 'site_code', 'name', 'scbd', 'published', 'base_host', 'updated_at',
    ])
  })

  it('uses InnoDB and utf8mb4 on every registry table, matching the file conventions', () => {
    expect(registryDdl.match(/ENGINE=InnoDB/g)).toHaveLength(3)
    expect(registryDdl.match(/DEFAULT CHARSET=utf8mb4/g)).toHaveLength(3)
    expect(registryDdl.match(/COLLATE=utf8mb4_unicode_ci/g)).toHaveLength(3)
  })

  it('comments every registry column', () => {
    const columnLines = registryDdl
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^[a-z_]+ (VARCHAR|TEXT|JSON|TINYINT|BIGINT|CHAR|TIMESTAMP)/.test(line))

    expect(columnLines.length).toBeGreaterThan(30)
    for (const line of columnLines) {
      expect(line, line).toMatch(/COMMENT '/)
    }
  })
})
