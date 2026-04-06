/**
 * logSubscribers.ts — Observer subscribers for deployment events
 *
 * Wires the deployEvents emitter to:
 *   1. DB persistence  → LogRepository.append (logs table, append-only)
 *   2. Supabase Realtime broadcast → channel "deployment:{id}" so the
 *      frontend can subscribe and stream logs live without polling
 *
 * HOW SUPABASE REALTIME WORKS HERE:
 *   - We use the Realtime Broadcast API (not DB replication).
 *   - Backend calls channel.send({ type: 'broadcast', event: '...', payload })
 *   - Frontend subscribes to channel "deployment:{id}" and receives events
 *     in real-time, regardless of network latency to the DB.
 *   - The DB logs INSERT still happens in parallel for persistence.
 *
 * CALL initLogSubscribers() ONCE at server startup (index.ts).
 *
 * Architecture: Observer Pattern (EventEmitter subscribers)
 */

import { deployEvents }   from './deployEvents';
import { supabase }       from './supabase';
import { logger }         from './logger';
import { LogRepository }  from '../modules/deployment/deployment.repository';

// ── Realtime channel cache ────────────────────────────────────────────────────

/**
 * Cache of active Supabase Realtime channels keyed by deploymentId.
 * Channels are created on deploy:start and closed on deploy:success/failed.
 */
const realtimeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

function getOrCreateChannel(deploymentId: string) {
  if (!realtimeChannels.has(deploymentId)) {
    const ch = supabase.channel(`deployment:${deploymentId}`);
    ch.subscribe();
    realtimeChannels.set(deploymentId, ch);
  }
  return realtimeChannels.get(deploymentId)!;
}

async function closeChannel(deploymentId: string): Promise<void> {
  const ch = realtimeChannels.get(deploymentId);
  if (ch) {
    try {
      await ch.unsubscribe();
      // supabase.removeChannel(ch) crashes in Node 20 with "connToClose.close is not a function"
      // so we just unsubscribe to stop listening.
    } catch (err) {
      // ignore
    }
    realtimeChannels.delete(deploymentId);
  }
}

// ── Broadcast helper ──────────────────────────────────────────────────────────

async function broadcast(
  deploymentId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const ch = getOrCreateChannel(deploymentId);
    await ch.send({
      type:    'broadcast',
      event,
      payload: { deploymentId, ...payload },
    });
  } catch (err) {
    // Realtime broadcast is best-effort — never block the pipeline
    logger.warn(`[realtime] Broadcast "${event}" failed: ${String(err)}`);
  }
}

// ── Subscriber setup ──────────────────────────────────────────────────────────

export function initLogSubscribers(): void {

  // ── deploy:start ───────────────────────────────────────────────────────────
  deployEvents.on('deploy:start', (payload) => {
    const msg = `[START] Deployment started for ${payload.username}/${payload.repoName}`;

    // Pre-create the realtime channel so it's ready before step events arrive
    getOrCreateChannel(payload.deploymentId);

    // Persist to logs table
    LogRepository.append(
      payload.deploymentId, payload.repoId, payload.userId, msg
    ).catch(() => undefined);

    // Broadcast
    void broadcast(payload.deploymentId, 'deploy:start', {
      username:  payload.username,
      repoName:  payload.repoName,
      message:   msg,
      timestamp: new Date().toISOString(),
    });

    logger.info(msg, {
      userId: payload.userId, repoId: payload.repoId, deploymentId: payload.deploymentId,
    });
  });

  // ── deploy:step ────────────────────────────────────────────────────────────
  deployEvents.on('deploy:step', (payload) => {
    // DB persistence is already handled by LogRepository.append inside
    // makeLog() inside the pipeline. We just add realtime broadcast here.
    void broadcast(payload.deploymentId, 'deploy:step', {
      step:      payload.step,
      message:   payload.message,
      timestamp: payload.timestamp,
    });
  });

  // ── deploy:success ─────────────────────────────────────────────────────────
  deployEvents.on('deploy:success', (payload) => {
    const msg = `[SUCCESS] Deployment complete in ${payload.durationMs}ms → ${payload.storagePath}`;

    LogRepository.append(
      payload.deploymentId, payload.repoId, payload.userId, msg
    ).catch(() => undefined);

    void broadcast(payload.deploymentId, 'deploy:success', {
      durationMs:  payload.durationMs,
      storagePath: payload.storagePath,
      commitSha:   payload.commitSha,
      message:     msg,
      timestamp:   new Date().toISOString(),
    });

    logger.info(msg, {
      userId: payload.userId, repoId: payload.repoId, deploymentId: payload.deploymentId,
      meta:   { durationMs: payload.durationMs, storagePath: payload.storagePath },
    });

    // Close realtime channel after a short delay to ensure final events flush
    setTimeout(() => void closeChannel(payload.deploymentId), 5_000);
  });

  // ── deploy:failed ──────────────────────────────────────────────────────────
  deployEvents.on('deploy:failed', (payload) => {
    const msg = `[FAILED] Deployment failed after ${payload.durationMs}ms: ${payload.error}`;

    LogRepository.append(
      payload.deploymentId, payload.repoId, payload.userId, msg
    ).catch(() => undefined);

    void broadcast(payload.deploymentId, 'deploy:failed', {
      durationMs: payload.durationMs,
      error:      payload.error,
      message:    msg,
      timestamp:  new Date().toISOString(),
    });

    logger.error(msg, {
      userId: payload.userId, repoId: payload.repoId, deploymentId: payload.deploymentId,
      meta:   { durationMs: payload.durationMs, error: payload.error },
    });

    // Close realtime channel
    setTimeout(() => void closeChannel(payload.deploymentId), 5_000);
  });

  logger.info('[logSubscribers] Deployment event subscribers registered');
}
