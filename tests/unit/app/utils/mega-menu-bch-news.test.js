import { describe, it, expect } from 'vitest';
import { isBchImportedNewsRecord, toBchNewsMenuItem, mergeBchNewsIntoMegaMenu } from '../../../../app/utils/mega-menu-bch-news.js';

const site = (title, changed) => ({ title, href: `/${title}`, changed });
const bchIndex = (title, updatedDate, schema = 'notification') => ({ title, schema, updatedDate, urls: [`https://bch.cbd.int/${title}`], href: `https://bch.cbd.int/${title}` });
const drupalNews = (title, changed) => ({ title, dnid: 7, fieldTypePlacement: { name: 'News' }, href: `/${title}`, changed });

describe('isBchImportedNewsRecord', () => {
    it('flags BCH index docs and BCH announcement articles', () => {
        expect(isBchImportedNewsRecord(bchIndex('a', '2026-01-01'))).toBe(true);
        expect(isBchImportedNewsRecord({ type: 'bch', title: 'x', dnid: 3 })).toBe(true);
    });

    it('rejects site-authored Drupal nodes and empty input', () => {
        expect(isBchImportedNewsRecord(drupalNews('n', '2026-01-01'))).toBe(false);
        expect(isBchImportedNewsRecord({ dnid: 4 })).toBe(false);
        expect(isBchImportedNewsRecord(null)).toBe(false);
    });

    it('accepts the BCH news schemas and rejects meetings', () => {
        for (const schema of ['news', 'notification', 'statement', 'pressRelease'])
            expect(isBchImportedNewsRecord(bchIndex('a', '2026-01-01', schema))).toBe(true);

        expect(isBchImportedNewsRecord(bchIndex('m', '2026-01-01', 'meeting'))).toBe(false);
        expect(isBchImportedNewsRecord({ title: 'x', href: 'https://bch.cbd.int/x' })).toBe(false);
    });
});

describe('toBchNewsMenuItem', () => {
    it('maps to a labelled menu item using the widget date precedence', () => {
        expect(toBchNewsMenuItem({ title: 't', urls: ['https://bch.cbd.int/t'], updatedDate: '2026-02-01', mediaImage: { src: 'img.jpg' } }))
            .toEqual({ title: 't', href: 'https://bch.cbd.int/t', thumb: 'img.jpg', changed: '2026-02-01', isFromBch: true });
    });

    it('drops records without a title or link', () => {
        expect(toBchNewsMenuItem({ title: 't' })).toBeNull();
        expect(toBchNewsMenuItem({ href: 'https://x' })).toBeNull();
    });

    it('drops links that are not https', () => {
        for (const href of ['http://bch.cbd.int/t', 'javascript:alert(1)', '/relative', 'not a url'])
            expect(toBchNewsMenuItem({ title: 't', href })).toBeNull();
    });
});

describe('mergeBchNewsIntoMegaMenu', () => {
    it('slots BCH items in newest first and labels them', () => {
        const result = mergeBchNewsIntoMegaMenu(
            [site('local', '2026-03-01')],
            [bchIndex('older', '2026-01-01'), bchIndex('newer', '2026-04-01'), drupalNews('dup-site', '2026-05-01'), bchIndex('meeting', '2026-05-01', 'meeting')],
            6
        );

        expect(result.map(({ title }) => title)).toEqual(['newer', 'local', 'older']);
        expect(result.filter(({ isFromBch }) => isFromBch).map(({ title }) => title)).toEqual(['newer', 'older']);
        expect(result.find(({ title }) => title === 'local').isFromBch).toBeUndefined();
    });

    it('keeps sticky site items on top even when a BCH item is newer', () => {
        const result = mergeBchNewsIntoMegaMenu(
            [{ ...site('pinned-old', '2024-01-01'), sticky: true }, site('recent', '2026-03-01')],
            [bchIndex('newest', '2026-06-01')],
            6
        );

        expect(result.map(({ title }) => title)).toEqual(['pinned-old', 'newest', 'recent']);
    });

    it('gives date ties to the site item', () => {
        const result = mergeBchNewsIntoMegaMenu([site('local', '2025-01-01')], [bchIndex('same-day', '2025-01-01')], 6);

        expect(result.map(({ title }) => title)).toEqual(['local', 'same-day']);
    });

    it('respects the item cap and ignores a missing or invalid cap', () => {
        const siteItems = [site('s1', '2026-01-01'), site('s2', '2025-01-01')];
        const bch = [bchIndex('b1', '2026-06-01'), bchIndex('b2', '2025-06-01')];

        expect(mergeBchNewsIntoMegaMenu(siteItems, bch, 3)).toHaveLength(3);
        expect(mergeBchNewsIntoMegaMenu(siteItems, bch, undefined)).toHaveLength(4);
        expect(mergeBchNewsIntoMegaMenu(siteItems, bch, 0)).toHaveLength(4);
    });

    it('dedupes BCH items by link, including links already in the site list', () => {
        const siteItems = [{ title: 'local copy', href: 'https://bch.cbd.int/a', changed: '2026-01-01' }];

        const result = mergeBchNewsIntoMegaMenu(siteItems, [bchIndex('a', '2026-02-01'), bchIndex('b', '2026-02-01'), bchIndex('b', '2026-02-01')], 6);

        expect(result.map(({ title }) => title)).toEqual(['b', 'local copy']);
    });

    it('tolerates missing inputs', () => {
        expect(mergeBchNewsIntoMegaMenu(undefined, null, 6)).toEqual([]);
        expect(mergeBchNewsIntoMegaMenu([site('s', '2026-01-01')], undefined, 6)).toHaveLength(1);
    });
});
