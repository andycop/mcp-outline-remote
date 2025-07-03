import pino from 'pino';
import { config } from 'dotenv';

config();

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Base logger configuration
const pinoOptions: pino.LoggerOptions = {
  level: LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      parameters: req.params,
      query: req.query,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
  },
};

// Create logger with pretty printing in development
const logger = isProduction
  ? pino(pinoOptions)
  : pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss.l',
          messageFormat: '{component} | {msg}',
          errorLikeObjectKeys: ['err', 'error'],
          errorProps: 'message,stack',
          singleLine: false,
        },
      },
    });

// Factory function to create child loggers
export const createLogger = (component: string): pino.Logger => {
  return logger.child({ component });
};

// Pre-configured loggers for different components
export const authLogger = createLogger('auth');
export const mcpLogger = createLogger('mcp');
export const toolsLogger = createLogger('tools');
export const apiLogger = createLogger('api');
export const serverLogger = createLogger('server');

// Export the base logger as default
export default logger;