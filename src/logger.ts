import pino from 'pino';

// HAWK_LOG_LEVEL: legacy (deprecated, still works)
// HAWK__LOGGING__LEVEL: new unified format (recommended)
const logLevel =
  process.env.HAWK__LOGGING__LEVEL ||
  process.env.HAWK_LOG_LEVEL ||
  'info';

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
