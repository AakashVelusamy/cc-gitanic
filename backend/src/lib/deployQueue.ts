// deployment task scheduler
// implements fifo job processing logic
// manages concurrency and queue status
// provides job lifecycle event emitters
// handles asynchronous task execution and errors

import { EventEmitter } from 'node:events';
import { logger } from './logger';

// queue types

export type JobThunk = () => Promise<void>;

export interface QueueJob {
  id: string; // deployment id
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

// deployment queue implementation

class DeployQueue extends EventEmitter {
  // jobs waiting to run
  readonly queue: QueueJob[] = [];

  // running status
  running = false;


  // add a job to the back of the queue
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

  // dequeue and execute next job
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

    // run async job
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
      // failure does not change active deployment
      this.emit('failed', job, err);
    }).finally(() => {
      this.running = false;
      this.processNext();  // advance fifo queue
    });
  }


  get depth(): number { return this.queue.length; }

  get isRunning(): boolean { return this.running; }
}

// typed emit/on/once overloads
declare interface DeployQueue {
  emit<K extends keyof QueueEventMap>(event: K, ...args: QueueEventMap[K]): boolean;
  on<K extends keyof QueueEventMap>(event: K, listener: (...args: QueueEventMap[K]) => void): this;
  once<K extends keyof QueueEventMap>(event: K, listener: (...args: QueueEventMap[K]) => void): this;
}

// singleton deployment queue
export const deployQueue = new DeployQueue();
