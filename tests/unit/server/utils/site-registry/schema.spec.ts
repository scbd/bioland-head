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

// `[a-z0-9_]` and not `[a-z_]`: has_bl1, has_bl2, i18n and i18n_enabled all
// carry digits, and a name-matching regex that silently skips four columns would
// make the exact-set assertions below a lie.
const COLUMN_LINE = /^([a-z0-9_]+) (VARCHAR|TEXT|JSON|TINYINT|BIGINT|CHAR|TIMESTAMP)/

/** Declared column names of one registry table, in declaration order. */
function columnsOf(table: string): string[] {
  const start = registryDdl.indexOf(`site_registry.${table}`)
  expect(start, `table ${table}`).toBeGreaterThan(-1)

  const rest = registryDdl.slice(start)
  const end = rest.indexOf('CREATE TABLE', 1)
  const body = end === -1 ? rest : rest.slice(0, end)

  return body
    .split('\n')
    .map(line => line.trim().match(COLUMN_LINE)?.[1])
    .filter((name): name is string => Boolean(name))
}

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

describe('schema.sql — the documented grants cover what the code actually runs', () => {
  // The file is the provisioning contract: a DBA applies it by hand and grants
  // what it says. If it under-documents a privilege, every push rolls back
  // access-denied in production and nothing in CI notices.

  it('documents SELECT and UPDATE across the registry database', () => {
    expect(registrySection).toMatch(/GRANT SELECT, UPDATE ON site_registry\.\*/)
  })

  it('documents the INSERT and DELETE that writeNetworkSummary needs', () => {
    // `writeNetworkSummary` replaces a slice with DELETE + INSERT; neither is
    // covered by SELECT/UPDATE, and MariaDB grants are database-scoped so the
    // existing i18n_cache access carries nothing here.
    expect(registrySection).toMatch(/GRANT INSERT, DELETE ON site_registry\.network_summary/)
  })

  it('keeps the write grant off the seeded tables', () => {
    // Widening INSERT/DELETE to site_registry.* would make multi_site_config and
    // site_config deletable by the application; they are seeded out of band.
    expect(registrySection).not.toMatch(/GRANT[^\n]*(?:INSERT|DELETE)[^\n]*ON site_registry\.\*/)
  })

  it('grants no privilege that would let the application change the schema', () => {
    expect(registrySection).not.toMatch(/GRANT[^\n]*\b(?:ALL|CREATE|ALTER|DROP|GRANT OPTION)\b/i)
  })

  it('writes no credential into the provisioning example', () => {
    expect(registrySection).not.toMatch(/IDENTIFIED\s+BY/i)
  })
})

describe('schema.sql — no secret-bearing column exists', () => {
  // Asserted as an EXACT SET per table, not as a denylist. A denylist only
  // catches the names somebody thought to list: `credentials`, `api_key`,
  // `auth`, `cert`, `pem`, `dsn` and every future one slip straight through.
  // An exact set fails on ANY new column, which forces a human to look at it
  // — the same pattern network_summary already used.

  it('declares exactly the intended multi_site_config columns, and no others', () => {
    expect(columnsOf('multi_site_config')).toEqual([
      'env',
      'multi_site_code',
      'name',
      'description',
      'base_host',
      'default_locale',
      'locales',
      'countries',
      'theme',
      'settings',
      'i18n',
      'config_generation',
      'source_hash',
      'created_at',
      'updated_at',
    ])
  })

  it('declares exactly the intended site_config columns, and no others', () => {
    expect(columnsOf('site_config')).toEqual([
      'env',
      'multi_site_code',
      'site_code',
      'name',
      'description',
      'logo',
      'host',
      'redirect',
      'aliases',
      'default_locale',
      'locales',
      'i18n_enabled',
      'country',
      'countries',
      'region',
      'continent',
      'published',
      'scbd',
      'has_bl1',
      'has_bl2',
      'migrated',
      'migrated_failed',
      'theme',
      'hide_home_page_widgets',
      'geo_bon_page',
      'last_known_good_settings',
      'last_known_good_at',
      'config_generation',
      'source_hash',
      'created_at',
      'updated_at',
    ])
  })

  it('declares no bare `meta` column at either level', () => {
    expect(registryColumnNames).not.toContain('meta')
  })

  it('carries the comment block saying what must never be stored and why', () => {
    expect(registrySection).toMatch(/WHAT MUST NEVER BE STORED HERE/)
    expect(registrySection).toMatch(/panoramaKey/)
    expect(registrySection).toMatch(/A\n?--? ?column that cannot hold a secret cannot leak one/s)
  })

  it('says the file is applied by a DBA, so nobody wires it into boot', () => {
    expect(registrySection).toMatch(/HOW THIS FILE IS APPLIED/)
    expect(registrySection).toMatch(/no CREATE privilege/)
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
    expect(registryDdl.match(/source_hash CHAR\(64\) CHARACTER SET ascii NULL/g))
      .toHaveLength(2)
    // utf8mb4 would reserve 4 bytes per character — 256 a row for 64 hex digits.
    expect(registryDdl).not.toMatch(/source_hash CHAR\(64\) NULL/)
  })

  it('carries the logo column the public projection emits', () => {
    expect(registryDdl).toMatch(/^\s*logo VARCHAR\(255\) NULL/m)
  })

  it('carries the multiSite identity columns the contract types require', () => {
    const multiSite = registryDdl.slice(
      registryDdl.indexOf('site_registry.multi_site_config'),
      registryDdl.indexOf('site_registry.site_config'),
    )
    expect(multiSite).toMatch(/^\s*name VARCHAR\(255\) NULL/m)
    expect(multiSite).toMatch(/^\s*description TEXT NULL/m)
    expect(multiSite).toMatch(/^\s*base_host VARCHAR\(255\) NULL/m)
  })

  it('declares no index that is a leftmost prefix of its own primary key', () => {
    // (env, multi_site_code) on site_config and (env) on network_summary were
    // both covered by the PK already; a duplicate only costs writes.
    expect(registryDdl).not.toMatch(/INDEX idx_slice \(env, multi_site_code\)/)
    expect(registryDdl).not.toMatch(/INDEX idx_env \(env\)/)
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
      .filter(line => COLUMN_LINE.test(line))

    expect(columnLines.length).toBeGreaterThan(30)
    for (const line of columnLines) {
      expect(line, line).toMatch(/COMMENT '/)
    }
  })
})
