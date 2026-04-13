// system-wide logging utility
// implements event-based log distribution
// includes structured metadata with every log
// handles environment-aware log level filtering
// formats timestamps and context tags for stdout

import { EventEmitter } from 'node:events';

// log types

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message: string;
  timestamp: string;
  userId?: string;
  repoId?: string;
  deploymentId?: string;
  meta?: Record<string, unknown>;
}

export type LogContext = Partial<Omit<LogEvent, 'level' | 'message' | 'timestamp'>>;

// applogger implementation

class AppLogger extends EventEmitter {
  constructor() {
    super();
    // stdout subscriber is always active
    this.on('log', this.stdoutSubscriber.bind(this));
  }

  private stdoutSubscriber(event: LogEvent): void {
    const prefix = `[${event.timestamp}] [${event.level.toUpperCase()}]`;
    const ctx = [
      event.userId      ? `user=${event.userId}`           : null,
      event.repoId      ? `repo=${event.repoId}`           : null,
      event.deploymentId ? `deploy=${event.deploymentId}` : null,
    ].filter(Boolean).join(' ');

    const line = ctx
      ? `${prefix} ${event.message}  ${ctx}`
      : `${prefix} ${event.message}`;

    if (event.level === 'error') {
      console.error(line, event.meta ?? '');
    } else {
      console.log(line, event.meta ?? '');
    }
  }

  
  private _emit(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): void {
    const event: LogEvent = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };
    this.emit('log', event);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      this._emit('debug', message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    this._emit('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this._emit('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this._emit('error', message, context);
  }
}

// singleton logger instance
export const logger = new AppLogger();
