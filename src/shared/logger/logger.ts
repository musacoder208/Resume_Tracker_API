import { createLogger, format, transports } from 'winston';
import { env } from '@shared/config/env';

const { combine, timestamp, colorize, printf } = format;

const logFormat = printf((info) => {
  return `[${info['timestamp']}] ${String(info.level).toUpperCase()}: ${String(info.message)}`;
});

const consoleTransport = new transports.Console({
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    ...(env.NODE_ENV === 'development' ? [colorize({ all: true })] : []),
    logFormat
  ),
});

const fileTransports =
  env.NODE_ENV === 'production'
    ? [
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
        }),
        new transports.File({
          filename: 'logs/combined.log',
          format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
        }),
      ]
    : [];

export const logger = createLogger({
  level: env.LOG_LEVEL,
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  },
  transports: [consoleTransport, ...fileTransports],
});

export default logger;
