import consola from 'consola';
import type { ConsolaInstance } from 'consola';
import { colorize } from 'consola/utils';
import { LOG_LEVEL } from './constants';
import type { LogLevelConfig, ConfiguredLogger } from '#shared/types/logger';

const DEFAULT_LEVEL = LOG_LEVEL.TRACE;

/**
 * Configures the global Consola logger with the specified logging level.
 * 
 * This function sets the logging threshold for the application-wide Consola instance.
 * Messages below the configured level will be suppressed. The function accepts multiple
 * input formats for flexibility and falls back to TRACE level for invalid inputs.
 * 
 * @param {LogLevelConfig} [level=DEFAULT_LEVEL] - The desired logging level. Accepts:
 *   - **Number**: Direct level value (0=Silent, 1=Fatal, 2=Error, 3=Warn, 4=Log, 5=Info, 6=Success, 7=Debug, 8=Trace)
 *   - **String**: Level name (case-insensitive): "SILENT", "FATAL", "ERROR", "WARN", "LOG", "INFO", "SUCCESS", "DEBUG", "TRACE"
 *   - **undefined**: Falls back to TRACE level (most verbose)
 * 
 * @returns {ConfiguredLogger} The configured Consola instance for chaining or direct use
 * 
 * @see {@link LOG_LEVEL} - Available logging level constants
 * @see {@link https://github.com/unjs/consola} - Consola documentation
 * 
 * @example
 * // Using numeric level (only show warnings and above)
 * configureLogger(3);
 * 
 * @example
 * // Using string level name (case-insensitive)
 * configureLogger('DEBUG');
 * configureLogger('warn');
 * 
 * @example
 * // Using predefined constants (recommended)
 * import { LOG_LEVEL } from './constants';
 * configureLogger(LOG_LEVEL.WARN);
 * configureLogger(LOG_LEVEL.INFO);
 * 
 * @example
 * // Default behavior (no arguments = TRACE level)
 * configureLogger(); // Shows all messages
 * 
 * @remarks
 * - Invalid numeric values (negative numbers) will fall back to DEFAULT_LEVEL
 * - Unrecognized string values will fall back to DEFAULT_LEVEL
 * - The configuration affects the global Consola instance
 * - Lower numeric values = less verbose (0=Silent shows nothing)
 * - Higher numeric values = more verbose (8=Trace shows everything)
 */
export const configureLogger = (level: LogLevelConfig = DEFAULT_LEVEL): ConfiguredLogger => {
  let resolvedLevel: number = DEFAULT_LEVEL;

  // Handle numeric values
  if (typeof level === 'number' && level >= 0) {
    resolvedLevel = level;
  }
  // Handle string values like "WARN", "DEBUG", etc.
  else if (typeof level === 'string') {
    const upperLevel = level.trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(LOG_LEVEL, upperLevel)) {
      resolvedLevel = LOG_LEVEL[upperLevel as keyof typeof LOG_LEVEL];
    }
  }

  consola.level = resolvedLevel;

  return consola;
};

export { consola, colorize };
export type { ConsolaInstance };
