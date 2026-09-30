import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'

// Reads the checked-in template, not a copy: the side mount and the float mount must be
// mutually exclusive on the same getter, and neither may key off the hostname.
const source = readFileSync(new URL('../../../../app/components/page/body/index.vue', import.meta.url), 'utf8')
const template = parse(source).descriptor.template?.content ?? ''
const tagOf = (id: string) => template.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] ?? ''
const wrapperOf = (id: string) => template.match(new RegExp(`<div[^>]*>\\s*<[^>]*id="${id}"`))?.[0] ?? ''

describe('page body info column placement (BL-1287)', () => {
    it('renders the side mount only when the column is not on the right', () => {
        expect(tagOf('page-body-tags-date-side-desktop')).toContain('v-if="!pageInfoColumnRight"')
    })

    it('renders the float mount only when the column is on the right, and never on media pages', () => {
        expect(wrapperOf('page-body-tags-date-desktop')).toContain('v-if="!isImageOrVideo && pageInfoColumnRight"')
    })

    it('no longer keys placement off the hostname', () => {
        expect(template).not.toContain('isBiosafetySite')
    })

    it('leaves the mobile mount and media details block untouched', () => {
        expect(tagOf('page-body-media-file-details-desktop')).toContain('v-if="isImageOrVideo || isDocument"')
        expect(tagOf('page-body-media-file-details-mobile')).not.toContain('pageInfoColumn')
    })
})
