import { LOG_LEVEL } from '#shared/utils/constants';
import { configureLogger } from '#shared/utils/logger';
import type { LogLevelConfig } from '#shared/types/logger';

/**
 * Nitro plugin to configure the global logger based on runtime config.
 * 
 * Sets up the Consola logging level from the public runtime configuration.
 * Falls back to TRACE level if no logLevel is specified in config.
 */
export default defineNitroPlugin(() => {
  const { public: { logLevel } = {} } = useRuntimeConfig();

  configureLogger((logLevel as LogLevelConfig) ?? LOG_LEVEL.TRACE);
});
