/**
 * deployQueue.ts — FIFO Deployment Queue
 *
 * Public API matches spec exactly:
 *   - queue: QueueJob[]       → the waiting job list
 *   - running: boolean        → whether a job is executing
 *   - processNext(): void     → dequeue and run the next job
 *
 * Only ONE job executes at a time. Failures do not block the queue.
 *
 * Architecture: FIFO Queue Pattern + Observer (EventEmitter) + Singleton
 */

import { EventEmitter } from 'events';
import { logger } from './logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobThunk = () => Promise<void>;

export interface QueueJob {
  /** deployment_history UUID */
  id: string;
  userId: string;
  repoId: string;
  enqueuedAt: Date;
  thunk: JobThunk;
}

export type QueueEventMap = {
  started:   [job: QueueJob];
  completed: [job: QueueJob];
  failed:    [job: QueueJob, error: unknown];
  drained:   [];
};

// ── DeployQueue ───────────────────────────────────────────────────────────────

class DeployQueue extends EventEmitter {
  /**
   * Jobs waiting to run (FIFO).
   * Public so external monitoring code can inspect depth without a getter.
   */
  readonly queue: QueueJob[] = [];

  /** True while a job thunk is executing. */
  running = false;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a job to the back of the queue and kick processNext().
   */
  enqueue(job: QueueJob): void {
    this.queue.push(job);
    logger.info('[queue] Job enqueued', {
      deploymentId: job.id,
      userId:       job.userId,
      repoId:       job.repoId,
      meta: { depth: this.queue.length },
    });
    this.processNext();
  }

  /**
   * Dequeue the next job and execute it.
   * No-op if a job is already running or the queue is empty.
   * Called internally after enqueue() and after each job finishes.
   */
  processNext(): void {
    if (this.running) return;

    const job = this.queue.shift();
    if (!job) {
      this.emit('drained');
      return;
    }

    this.running = true;

    logger.info('[queue] Job starting', {
      deploymentId: job.id,
      userId:       job.userId,
      repoId:       job.repoId,
      meta: { remaining: this.queue.length },
    });
    this.emit('started', job);

    // Run async job; always advance queue in finally
    job.thunk().then(() => {
      logger.info('[queue] Job completed', {
        deploymentId: job.id,
        userId:       job.userId,
        repoId:       job.repoId,
      });
      this.emit('completed', job);
    }).catch((err: unknown) => {
      logger.error('[queue] Job failed', {
        deploymentId: job.id,
        userId:       job.userId,
        repoId:       job.repoId,
        meta: { error: String(err) },
      });
      // FAILURE RULE: active_deployment_id MUST NOT change on failure.
      // The thunk is responsible for calling markFailed (not markSuccess).
      this.emit('failed', job, err);
    }).finally(() => {
      this.running = false;
      this.processNext();  // advance FIFO queue
    });
  }

  // ── Convenience getters (backwards-compatible) ────────────────────────────

  /** Alias: number of waiting jobs. */
  get depth(): number { return this.queue.length; }

  /** Alias: whether a job is running. */
  get isRunning(): boolean { return this.running; }
}

// Typed emit/on/once overloads
declare interface DeployQueue {
  emit<K extends keyof QueueEventMap>(event: K, ...args: QueueEventMap[K]): boolean;
  on<K extends keyof QueueEventMap>(event: K, listener: (...args: QueueEventMap[K]) => void): this;
  once<K extends keyof QueueEventMap>(event: K, listener: (...args: QueueEventMap[K]) => void): this;
}

/** Singleton — one shared queue per process. */
export const deployQueue = new DeployQueue();
