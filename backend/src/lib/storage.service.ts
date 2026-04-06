/**
 * storage.service.ts — Supabase Storage operations for the deployment pipeline
 *
 * Bucket layout:
 *   deployments/{username}/{deploymentId}/index.html
 *   deployments/{username}/{deploymentId}/assets/main.js
 *   deployments/{username}/{deploymentId}/...
 *
 * Upload strategy:
 *   - Walk output directory recursively (preserves full folder structure)
 *   - Upload files in parallel batches (UPLOAD_CONCURRENCY = 5)
 *   - upsert: true so re-deployments overwrite previous files
 *
 * Cleanup policy:
 *   - Keep the last KEEP_DEPLOYMENTS (default 5) deployments in Storage
 *   - Delete all older folders for the same user
 *   - Only deletes from Storage — NOT from DB (DB is append-only + history)
 *   - Tolerates partial failures (logs warn, never throws)
 *
 * Architecture: Service Layer (wraps Supabase Storage SDK)
 */

import path from 'node:path';
import fs   from 'node:fs';
import { supabase, DEPLOYMENTS_BUCKET, deploymentStoragePath } from './supabase';
import { logger } from './logger';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Max parallel upload requests per deployment job. */
const UPLOAD_CONCURRENCY = 5;

/**
 * Number of recent deployment folders to keep in Supabase Storage.
 * Older folders are deleted after each successful deployment.
 * Range 3–5 per spec (default 5).
 */
const KEEP_DEPLOYMENTS = 5;

// ── StorageService ────────────────────────────────────────────────────────────

export const StorageService = {

  /**
   * Upload the entire output directory to Supabase Storage.
   * Folder structure is preserved relative to outputDir.
   *
   * Returns the storage path prefix (without bucket name):
   *   e.g.  "{username}/{deploymentId}"
   */
  async upload(
    outputDir:    string,
    username:     string,
    deploymentId: string,
    log: (msg: string) => Promise<void>
  ): Promise<string> {
    const storagePath = deploymentStoragePath(username, deploymentId);
    const files = walkDir(outputDir);

    await log(`[storage] Uploading ${files.length} file(s) → ${DEPLOYMENTS_BUCKET}/${storagePath}/`);

    // Upload in parallel batches to avoid overwhelming the Supabase API
    for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
      const batch = files.slice(i, i + UPLOAD_CONCURRENCY);

      await Promise.all(batch.map(async (filePath) => {
        // Preserve directory structure relative to outputDir
        const relative  = path.relative(outputDir, filePath).replace(/\\/g, '/');
        const objectKey = `${storagePath}/${relative}`;
        const fileBuffer = fs.readFileSync(filePath);
        const mimeType   = inferContentType(filePath);

        const { error } = await supabase.storage
          .from(DEPLOYMENTS_BUCKET)
          .upload(objectKey, fileBuffer, {
            contentType: mimeType,
            upsert:      true,   // overwrite on re-deploy
          });

        if (error) {
          throw new Error(
            `[storage] Upload failed for "${relative}": ${error.message}`
          );
        }
      }));
    }

    await log(`[storage] Upload complete (${files.length} files)`);
    return storagePath;
  },

  /**
   * Prune old deployment folders for a given user, keeping only the
   * most recent KEEP_DEPLOYMENTS folders.
   *
   * This is called after a successful deployment to prevent unbounded
   * growth in Supabase Storage.
   *
   * Strategy:
   *   1. List all objects under "deployments/{username}/"
   *   2. Extract unique deployment-ID prefixes
   *   3. Sort by name (UUIDs with timestamp-based order aren't reliable;
   *      we rely on the caller passing successfulDepIds in creation order)
   *   4. Delete all objects whose prefix is NOT in the latest KEEP_DEPLOYMENTS
   *
   * @param username           - repo owner
   * @param recentDepIds       - ordered list (newest → oldest) of successful deployment IDs
   * @param activeDeploymentId - the current active_deployment_id (never deleted, even if outside keepSet)
   */
  async pruneOldDeployments(
    username:            string,
    recentDepIds:        string[],   // caller supplies from DB (ordered newest first)
    activeDeploymentId?: string      // safety guard — never delete the live deployment
  ): Promise<void> {
    // Keep only the first KEEP_DEPLOYMENTS IDs (newest)
    const keepSet = new Set(recentDepIds.slice(0, KEEP_DEPLOYMENTS));

    // Defense-in-depth: always protect the active deployment, even if it somehow
    // isn't in the top N (e.g. manual pointer reset, race condition).
    if (activeDeploymentId) keepSet.add(activeDeploymentId);

    const toDelete = recentDepIds.filter((id) => !keepSet.has(id));

    if (toDelete.length === 0) {
      logger.debug(`[storage] Prune: ${username} has ${recentDepIds.length} deployment(s) — no pruning needed`);
      return;
    }

    logger.info(`[storage] Pruning ${toDelete.length} old deployment(s) for ${username}`, {
      meta: { toDelete, keeping: [...keepSet] },
    });

    for (const depId of toDelete) {
      await StorageService.deleteDeployment(username, depId);
    }
  },

  /**
   * Delete ALL objects under deployments/{username}/{deploymentId}/.
   *
   * Supabase Storage does not have a folder-delete API — we must:
   *   1. List objects under the prefix
   *   2. Delete them in bulk (max 1000 per call)
   *
   * Errors are logged but NOT re-thrown (cleanup is best-effort).
   */
  async deleteDeployment(username: string, deploymentId: string): Promise<void> {
    const prefix = deploymentStoragePath(username, deploymentId);

    try {
      // List everything under the prefix (paginate if needed)
      const { data: objects, error: listErr } = await supabase.storage
        .from(DEPLOYMENTS_BUCKET)
        .list(prefix, { limit: 1000, offset: 0 });

      if (listErr) {
        logger.warn(`[storage] Failed to list objects under ${prefix}: ${listErr.message}`);
        return;
      }

      if (!objects || objects.length === 0) {
        logger.debug(`[storage] No objects found under ${prefix} — already deleted?`);
        return;
      }

      // Build full object paths for the delete call
      const objectPaths = objects.map((obj) => `${prefix}/${obj.name}`);

      const { error: delErr } = await supabase.storage
        .from(DEPLOYMENTS_BUCKET)
        .remove(objectPaths);

      if (delErr) {
        logger.warn(`[storage] Failed to delete objects under ${prefix}: ${delErr.message}`);
        return;
      }

      logger.info(`[storage] Deleted ${objectPaths.length} object(s) from ${prefix}`);

    } catch (err) {
      // Never throw — pruning is best-effort
      logger.warn(`[storage] Unexpected error pruning ${prefix}: ${String(err)}`);
    }
  },
};

// ── File utilities ─────────────────────────────────────────────────────────────

/** Recursively collect all file paths under dir. */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else                     results.push(full);
  }
  return results;
}

/** Map file extensions to MIME types. */
function inferContentType(filePath: string): string {
  const map: Record<string, string> = {
    '.html':  'text/html; charset=utf-8',
    '.css':   'text/css; charset=utf-8',
    '.js':    'application/javascript',
    '.mjs':   'application/javascript',
    '.cjs':   'application/javascript',
    '.json':  'application/json',
    '.map':   'application/json',
    '.ts':    'application/typescript',
    '.svg':   'image/svg+xml',
    '.png':   'image/png',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.gif':   'image/gif',
    '.webp':  'image/webp',
    '.avif':  'image/avif',
    '.ico':   'image/x-icon',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':   'font/ttf',
    '.eot':   'application/vnd.ms-fontobject',
    '.otf':   'font/otf',
    '.txt':   'text/plain; charset=utf-8',
    '.md':    'text/markdown; charset=utf-8',
    '.xml':   'application/xml',
    '.mp4':   'video/mp4',
    '.webm':  'video/webm',
    '.mp3':   'audio/mpeg',
    '.wav':   'audio/wav',
    '.pdf':   'application/pdf',
  };
  return map[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
