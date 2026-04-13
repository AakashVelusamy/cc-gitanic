// cloud storage orchestration service
// uploads build artifacts to supabase storage
// implements concurrent file upload scheduling
// infers mime types based on file extensions
// prunes old deployments to optimize space

import path from 'node:path';
import fs   from 'node:fs';
import { supabase, DEPLOYMENTS_BUCKET, deploymentStoragePath } from './supabase';
import { logger } from './logger';

// configuration

// max parallel upload requests
const UPLOAD_CONCURRENCY = 5;

// number of recent deployment folders to keep in storage
const KEEP_DEPLOYMENTS = 1;

// storageservice implementation

export const StorageService = {

  // upload output directory to storage preserving folder structure
  async upload(
    outputDir:    string,
    username:     string,
    deploymentId: string,
    log: (msg: string) => Promise<void>
  ): Promise<string> {
    const storagePath = deploymentStoragePath(username, deploymentId);
    const files = walkDir(outputDir);

    await log(`[storage] Uploading ${files.length} file(s) → ${DEPLOYMENTS_BUCKET}/${storagePath}/`);

    // upload in parallel batches to avoid overwhelming the supabase api
    for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
      const batch = files.slice(i, i + UPLOAD_CONCURRENCY);

      await Promise.all(batch.map(async (filePath) => {
        // preserve directory structure relative to outputdir
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

  // prune old deployment folders for a given user
  async pruneOldDeployments(
    username:            string,
    recentDepIds:        string[],   // caller supplies from db (ordered newest first)
    activeDeploymentId?: string      // safety guard — never delete the live deployment
  ): Promise<void> {
    // keep only the first keep_deployments ids (newest)
    const keepSet = new Set(recentDepIds.slice(0, KEEP_DEPLOYMENTS));

    // defense-in-depth: always protect the active deployment, even if it somehow
    // isn't in the top n (e.g. manual pointer reset, race condition).
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

  // delete all objects under a deployment prefix
  async deleteDeployment(username: string, deploymentId: string): Promise<void> {
    const prefix = deploymentStoragePath(username, deploymentId);

    try {
      // list everything under the prefix (paginate if needed)
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

      // build full object paths for the delete call
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
      // never throw — pruning is best-effort
      logger.warn(`[storage] Unexpected error pruning ${prefix}: ${String(err)}`);
    }
  },
};

// file utilities

// recursively collect all file paths
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else                     results.push(full);
  }
  return results;
}

// map file extensions to mime types
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
