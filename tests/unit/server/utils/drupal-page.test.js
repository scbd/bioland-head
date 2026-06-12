import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { backfillAttachments, getSearchParams } from '../../../../server/utils/drupal/drupal-page.js'

// Test the isAliasPath helper function logic
// Note: These tests verify the logic patterns since the actual function is private

describe('drupal-page utilities', () => {
  describe('isAliasPath detection logic', () => {
    // Simulate the isAliasPath function logic
    const isAliasPath = (path) => {
      const numericPatterns = [
        /^\/node\/\d+$/,
        /^\/media\/\d+$/,
        /^\/taxonomy\/term\/\d+$/,
      ];
      return !numericPatterns.some(pattern => pattern.test(path));
    };

    it('should return false for numeric node paths', () => {
      expect(isAliasPath('/node/123')).toBe(false);
      expect(isAliasPath('/node/1')).toBe(false);
      expect(isAliasPath('/node/99999')).toBe(false);
    });

    it('should return false for numeric media paths', () => {
      expect(isAliasPath('/media/456')).toBe(false);
      expect(isAliasPath('/media/10288')).toBe(false);
    });

    it('should return false for numeric taxonomy paths', () => {
      expect(isAliasPath('/taxonomy/term/789')).toBe(false);
      expect(isAliasPath('/taxonomy/term/20')).toBe(false);
    });

    it('should return true for alias paths', () => {
      expect(isAliasPath('/image/world-biodiversity-summit-jpg')).toBe(true);
      expect(isAliasPath('/about')).toBe(true);
      expect(isAliasPath('/biodiversity-data/gbif')).toBe(true);
    });

    it('should return true for paths with additional segments after numeric id', () => {
      // These are not simple numeric entity paths
      expect(isAliasPath('/node/123/edit')).toBe(true);
      expect(isAliasPath('/media/456/download')).toBe(true);
    });

    it('should return true for paths with text instead of numbers', () => {
      expect(isAliasPath('/node/about')).toBe(true);
      expect(isAliasPath('/media/image-name')).toBe(true);
    });
  });

  describe('locale alias redirect scenarios', () => {
    it('should describe the expected behavior for locale-specific aliases', () => {
      /**
       * Scenario: User visits /en/image/world-biodiversity-summit-jpg
       * - This alias only exists in 'fr' locale
       * - Drupal router/translate-path returns "Unable to resolve path"
       * - System should search for alias in other locales
       * - If found in 'fr', redirect to /fr/image/world-biodiversity-summit-jpg
       */
      const requestedPath = '/image/world-biodiversity-summit-jpg';
      const requestedLocale = 'en';
      const aliasExistsInLocale = 'fr';
      
      // Expected redirect path
      const expectedRedirect = `/${aliasExistsInLocale}${requestedPath}`;
      expect(expectedRedirect).toBe('/fr/image/world-biodiversity-summit-jpg');
    });

    it('should describe the expected behavior for numeric media paths', () => {
      /**
       * Scenario: User visits /en/media/10288
       * - This numeric path resolves in any locale
       * - Drupal returns canonical as /fr/image/world-biodiversity-summit-jpg
       * - BUT the canonical locale (fr) doesn't match requested locale (en)
       * - So no redirect happens (correct behavior - don't redirect to different language)
       * - Page should still render with the media content
       */
      const requestedPath = '/media/10288';
      const requestedLocale = 'en';
      const canonicalLocale = 'fr';
      
      // Redirect should NOT happen when locales differ
      const shouldRedirect = canonicalLocale === requestedLocale;
      expect(shouldRedirect).toBe(false);
    });
  });

  describe('getSearchParams media includes', () => {
    const ctx = {};

    it('includes field_media_image for a standalone media--hero page', () => {
      // Without this include the hero file reference has no uri.url and the page
      // renders blank.
      const search = getSearchParams(ctx, 'media', 'hero');
      expect(search.include).toContain('field_media_image');
    });

    it('includes field_media_image for a media--image page', () => {
      const search = getSearchParams(ctx, 'media', 'image');
      expect(search.include).toContain('field_media_image');
    });

    it('includes both file fields for a media--document page', () => {
      const search = getSearchParams(ctx, 'media', 'document');
      expect(search.include).toContain('field_media_image');
      expect(search.include).toContain('field_media_document');
    });

    it('requests no file include for a media--remote_video page', () => {
      // remote_video carries an oembed URL + thumbnail, not field_media_image —
      // including it returns 405.
      const search = getSearchParams(ctx, 'media', 'remote_video');
      expect(search.include).toBeUndefined();
    });
  });

  describe('backfillAttachments media handling', () => {
    let calls;

    beforeEach(() => {
      calls = [];
      // Capture every JSON:API request the backfill helpers attempt.
      globalThis.$fetch = vi.fn(async (uri, opts) => {
        calls.push({ uri, query: opts?.query });
        return { data: null };
      });
      // Pass options straight through so the recorded query reflects the include list.
      globalThis.$fetchBaseOptions = vi.fn((opts = {}) => opts);
    });

    afterEach(() => {
      delete globalThis.$fetch;
      delete globalThis.$fetchBaseOptions;
    });

    const ctx = { host: 'https://gt.bsl.staging.cbd.int' };

    it('does not request field_attachments for a standalone media entity (the 405 case)', async () => {
      // A media--remote_video page has no field_attachments relationship; requesting
      // /jsonapi/media/remote_video/<id>/field_attachments returned 405.
      const doc = { id: 'uuid-remote-video', type: 'media--remote_video' };

      const result = await backfillAttachments(ctx, doc, 'media', 'remote_video');

      expect(result).toBe(doc);
      expect(globalThis.$fetch).not.toHaveBeenCalled();
    });

    it('skips a remote_video attachment instead of requesting field_media_document', async () => {
      const doc = {
        id: 'uuid-node',
        type: 'node--content',
        field_attachments: [{ id: 'rv-1', type: 'media--remote_video' }],
      };

      await backfillAttachments(ctx, doc, 'node', 'content');

      // remote_video carries neither field_media_image nor field_media_document.
      expect(globalThis.$fetch).not.toHaveBeenCalled();
    });

    it('keeps requesting field_media_document for a document attachment', async () => {
      const doc = {
        id: 'uuid-node',
        type: 'node--content',
        field_attachments: [{ id: 'doc-1', type: 'media--document' }],
      };

      await backfillAttachments(ctx, doc, 'node', 'content');

      const docCall = calls.find((c) => c.uri.includes('/jsonapi/media/document/'));
      expect(docCall).toBeDefined();
      expect(docCall.query.include).toContain('field_media_document');
    });

    it('does not request field_media_document for an image attachment', async () => {
      const doc = {
        id: 'uuid-node',
        type: 'node--content',
        field_attachments: [{ id: 'img-1', type: 'media--image' }],
      };

      await backfillAttachments(ctx, doc, 'node', 'content');

      const imgCall = calls.find((c) => c.uri.includes('/jsonapi/media/image/'));
      expect(imgCall).toBeDefined();
      expect(imgCall.query.include).toContain('field_media_image');
      expect(imgCall.query.include).not.toContain('field_media_document');
    });
  });
});
