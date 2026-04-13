import pino from 'pino';

export const logger = pino({
  level: process.env.HAWK_LOG_LEVEL || 'info',
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
