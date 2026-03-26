/**
 * deployEvents.ts — Typed deployment event emitter (Observer Pattern)
 *
 * All deployment lifecycle events are emitted here.
 * Subscribers (logger, Realtime broadcaster) register once at startup.
 *
 * Events:
 *   deploy:start    — job dequeued and pipeline begins
 *   deploy:step     — individual pipeline step log line
 *   deploy:success  — deployment completed successfully
 *   deploy:failed   — deployment failed at any step
 *
 * Log format in DB/output:  "[STEP] message"
 *
 * Architecture: Observer Pattern + Singleton EventEmitter
 */

import { EventEmitter } from 'events';

// ── Event payload types ───────────────────────────────────────────────────────

export interface DeployStartPayload {
  deploymentId: string;
  repoId:       string;
  userId:       string;
  username:     string;
  repoName:     string;
  enqueuedAt:   Date;
}

export interface DeployStepPayload {
  deploymentId: string;
  repoId:       string;
  userId:       string;
  /** Formatted as "[STEP] message" — ready to store in DB. */
  message:      string;
  step:         string;   // e.g. "validate", "checkout", "build", "upload"
  timestamp:    string;   // ISO 8601
}

export interface DeploySuccessPayload {
  deploymentId: string;
  repoId:       string;
  userId:       string;
  username:     string;
  repoName:     string;
  durationMs:   number;
  storagePath:  string;
  commitSha:    string;
}

export interface DeployFailedPayload {
  deploymentId: string;
  repoId:       string;
  userId:       string;
  username:     string;
  repoName:     string;
  durationMs:   number;
  error:        string;
}

// ── Event map ─────────────────────────────────────────────────────────────────

export type DeployEventMap = {
  'deploy:start':   [payload: DeployStartPayload];
  'deploy:step':    [payload: DeployStepPayload];
  'deploy:success': [payload: DeploySuccessPayload];
  'deploy:failed':  [payload: DeployFailedPayload];
};

// ── DeployEventEmitter ────────────────────────────────────────────────────────

class DeployEventEmitter extends EventEmitter {
  /** Emit a deploy:start event. */
  start(payload: DeployStartPayload): void {
    this.emit('deploy:start', payload);
  }

  /**
   * Emit a deploy:step event.
   * Formats the message as "[STEP] message" for consistency.
   */
  step(
    deploymentId: string,
    repoId:       string,
    userId:       string,
    step:         string,
    message:      string
  ): void {
    const formatted = `[${step.toUpperCase()}] ${message}`;
    const payload: DeployStepPayload = {
      deploymentId,
      repoId,
      userId,
      step,
      message: formatted,
      timestamp: new Date().toISOString(),
    };
    this.emit('deploy:step', payload);
  }

  /** Emit a deploy:success event. */
  success(payload: DeploySuccessPayload): void {
    this.emit('deploy:success', payload);
  }

  /** Emit a deploy:failed event. */
  failed(payload: DeployFailedPayload): void {
    this.emit('deploy:failed', payload);
  }
}

// Typed overloads for emit/on/once
declare interface DeployEventEmitter {
  emit<K extends keyof DeployEventMap>(event: K, ...args: DeployEventMap[K]): boolean;
  on<K extends keyof DeployEventMap>(event: K, listener: (...args: DeployEventMap[K]) => void): this;
  once<K extends keyof DeployEventMap>(event: K, listener: (...args: DeployEventMap[K]) => void): this;
}

/** Singleton — one event bus per process. */
export const deployEvents = new DeployEventEmitter();
