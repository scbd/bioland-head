import {
  findMissingPublicConfig,
  formatMissingPublicConfigError,
} from '#shared/utils/required-public-config';

/**
 * Fail loudly at Nitro startup when required public runtime config is missing.
 *
 * Without this the server boots happily and binds its port, then every single
 * request dies with an opaque `getSiteSettings cache key missing required
 * context: env=, multiSiteCode=`. The numeric prefix keeps this ahead of the
 * other server plugins so nothing else runs against a broken config.
 *
 * Names variables only — never values.
 */
export default defineNitroPlugin(() => {
  const { public: publicConfig } = useRuntimeConfig();

  const missing = findMissingPublicConfig(publicConfig as Record<string, unknown>);

  if (missing.length === 0) return;

  const message = formatMissingPublicConfigError(missing);

  // Nitro swallows some startup rejections into a generic trace; log first so the
  // cause is visible even when the thrown error is reported second-hand.
  console.error(`[startup] ${message}`);

  throw new Error(message);
});
