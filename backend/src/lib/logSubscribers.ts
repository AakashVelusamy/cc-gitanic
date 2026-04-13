// deployment event observation service
// maps pipeline events to realtime broadcasts
// coordinates log persistence into database
// manages lifecycle of realtime communication channels
// implements best-effort delivery for build updates

import { deployEvents }   from './deployEvents';
import { supabase }       from './supabase';
import { logger }         from './logger';
import { LogRepository }  from '../modules/deployment/deployment.repository';

// active supabase realtime channels keyed by deploymentid
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
      // unsubscribe to stop listening
    } catch (err) {
      // unsubscribe errors are non-critical
      logger.warn(`[realtime] Failed to unsubscribe channel for deployment ${deploymentId}: ${String(err)}`);
    }
    realtimeChannels.delete(deploymentId);
  }
}

// broadcast helper

async function broadcast(
  deploymentId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const ch = getOrCreateChannel(deploymentId);
    await ch.httpSend(event, { deploymentId, ...payload });
  } catch (err) {
    // realtime broadcast is best-effort — never block the pipeline
    logger.warn(`[realtime] Broadcast "${event}" failed: ${String(err)}`);
  }
}

// subscriber setup

export function initLogSubscribers(): void {

  // handle deploy:start
  deployEvents.on('deploy:start', (payload) => {
    const msg = `[START] Deployment started for ${payload.username}/${payload.repoName}`;

    // pre-create the realtime channel so it's ready before step events arrive
    getOrCreateChannel(payload.deploymentId);

    // persist to logs table
    LogRepository.append(
      payload.deploymentId, payload.repoId, payload.userId, msg
    ).catch(() => undefined);

    // broadcast
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

  // handle deploy:step
  deployEvents.on('deploy:step', (payload) => {
    // db persistence is already handled by logrepository.append inside
    // makelog() inside the pipeline. we just add realtime broadcast here.
    void broadcast(payload.deploymentId, 'deploy:step', {
      step:      payload.step,
      message:   payload.message,
      timestamp: payload.timestamp,
    });
  });

  // handle deploy:success
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

    // close realtime channel after a short delay to ensure final events flush
    setTimeout(() => void closeChannel(payload.deploymentId), 5_000);
  });

  // handle deploy:failed
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

    // close realtime channel
    setTimeout(() => void closeChannel(payload.deploymentId), 5_000);
  });

  logger.info('[logSubscribers] Deployment event subscribers registered');
}
