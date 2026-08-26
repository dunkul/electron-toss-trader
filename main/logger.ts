import path from 'node:path';
import { app } from 'electron';
import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL ?? 'info';
const logFile = path.join(app.getPath('userData'), 'logs', 'app.log');

export const logger = pino(
  { level },
  pino.transport({
    targets: [
      ...(isProd
        ? []
        : [
            {
              target: 'pino-pretty',
              level,
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
            },
          ]),
      { target: 'pino/file', level, options: { destination: logFile, mkdir: true } },
    ],
  }),
);
