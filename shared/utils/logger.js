import consola from 'consola';
import { colorize } from 'consola/utils';
import { LOG_LEVEL } from './constants.js';

const DEFAULT_LEVEL = LOG_LEVEL.TRACE;

export const configureLogger = (level = DEFAULT_LEVEL) => {
  const resolvedLevel =
    typeof level === 'number' && level >= 0 ? level : DEFAULT_LEVEL;

  // console.log('[configureLogger] Setting log level:', {
  //   received: level,
  //   resolved: resolvedLevel,
  //   DEFAULT_LEVEL,
  //   LOG_LEVEL
  // });

  consola.level = resolvedLevel;

  return consola;
};

export { consola, colorize };
