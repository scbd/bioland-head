/**
 * Logger type definitions
 * Types for the Consola-based logging system
 */

import type { ConsolaInstance } from 'consola';

/**
 * Logging levels compatible with Consola
 * Maps to Consola's internal logging level system
 */
export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * String representations of log levels
 */
export type LogLevelName = 'FATAL' | 'WARN' | 'LOG' | 'INFO' | 'DEBUG' | 'TRACE';

/**
 * Union type for log level configuration
 * Accepts numeric level, string name, or undefined (defaults to TRACE)
 */
export type LogLevelConfig = LogLevel | LogLevelName | undefined;

/**
 * Logger configuration function result
 * Returns a configured Consola instance
 */
export type ConfiguredLogger = ConsolaInstance;
