import { initializeThesaurusSourceMap } from '../utils/thesaurus/source-map';

export default defineNitroPlugin((nitro) => {
  // Initialize thesaurus source map on app startup (warm the cache)
  initializeThesaurusSourceMap();
});
