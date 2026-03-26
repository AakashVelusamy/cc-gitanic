/**
 * logger.ts — Application-wide event logger
 *
 * Implements the Observer Pattern using Node's built-in EventEmitter.
 * Components emit structured log events; subscribers write them to
 * stdout and (in later phases) persist them to the `logs` DB table.
 *
 * Architecture: Observer Pattern + Singleton
 */

import { EventEmitter } from 'events';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message: string;
  /** ISO timestamp — set automatically by emit helpers */
  timestamp: string;
  /** Context fields for DB persistence (optional at emit time) */
  userId?: string;
  repoId?: string;
  deploymentId?: string;
  /** Extra arbitrary key-value metadata */
  meta?: Record<string, unknown>;
}

// ── EventEmitter singleton ────────────────────────────────────────────────────

class AppLogger extends EventEmitter {
  constructor() {
    super();
    // Default stdout subscriber — always active
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

  // ── Public emit helpers ────────────────────────────────────────────────────

  private _emit(
    level: LogLevel,
    message: string,
    context?: Omit<LogEvent, 'level' | 'message' | 'timestamp'>
  ): void {
    const event: LogEvent = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };
    this.emit('log', event);
  }

  debug(message: string, context?: Omit<LogEvent, 'level' | 'message' | 'timestamp'>): void {
    if (process.env.NODE_ENV !== 'production') {
      this._emit('debug', message, context);
    }
  }

  info(message: string, context?: Omit<LogEvent, 'level' | 'message' | 'timestamp'>): void {
    this._emit('info', message, context);
  }

  warn(message: string, context?: Omit<LogEvent, 'level' | 'message' | 'timestamp'>): void {
    this._emit('warn', message, context);
  }

  error(message: string, context?: Omit<LogEvent, 'level' | 'message' | 'timestamp'>): void {
    this._emit('error', message, context);
  }
}

/** Singleton logger instance — import and use across the entire backend. */
export const logger = new AppLogger();
