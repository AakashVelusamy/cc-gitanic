// deployment event definitions
// defines typed payloads for pipeline stages
// provides centralized event bus for deployments
// maps pipeline progress to observer patterns
// enables cross-module realtime notification

import { EventEmitter } from 'node:events';

// event payload types

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
  message:      string;
  step:         string;   // e.g. "validate", "checkout", "build", "upload"
  timestamp:    string;   // iso 8601
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

// event map

export type DeployEventMap = {
  'deploy:start':   [payload: DeployStartPayload];
  'deploy:step':    [payload: DeployStepPayload];
  'deploy:success': [payload: DeploySuccessPayload];
  'deploy:failed':  [payload: DeployFailedPayload];
};

// deployeventemitter implementation

class DeployEventEmitter extends EventEmitter {
  start(payload: DeployStartPayload): void {
    this.emit('deploy:start', payload);
  }

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

  success(payload: DeploySuccessPayload): void {
    this.emit('deploy:success', payload);
  }

  failed(payload: DeployFailedPayload): void {
    this.emit('deploy:failed', payload);
  }
}

// typed overloads for emit/on/once
declare interface DeployEventEmitter {
  emit<K extends keyof DeployEventMap>(event: K, ...args: DeployEventMap[K]): boolean;
  on<K extends keyof DeployEventMap>(event: K, listener: (...args: DeployEventMap[K]) => void): this;
  once<K extends keyof DeployEventMap>(event: K, listener: (...args: DeployEventMap[K]) => void): this;
}

// singleton event bus
export const deployEvents = new DeployEventEmitter();
