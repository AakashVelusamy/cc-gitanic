// main application entry point
// initializes log subscribers for deployment events
// configures express with cors and security headers
// mounts git protocol passthrough and api routers
// runs repository reconciliation on startup
import 'dotenv/config';
import express from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler }  from './middleware/errorHandler';
import cors from 'cors';
import { initLogSubscribers } from './lib/logSubscribers';
import { reconcileReposOnDisk } from './modules/repos/repo.service';

import authRouter     from './routes/auth';
import repoRouter     from './routes/repos';
import deployRouter   from './routes/deploy';
import gitRouter      from './routes/git';
import internalRouter from './routes/internal';

// initialize observers
initLogSubscribers();

const app = express();
app.disable('x-powered-by');
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

// cors configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '',
  credentials: true,
}));
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
});

// mount /git before body parsers for raw streaming
app.use('/git', gitRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api/auth',  authRouter);
app.use('/api/repos', repoRouter);
app.use('/api',       deployRouter);
app.use('/internal',  internalRouter);

app.use(errorHandler);

// start server
app.listen(PORT, async () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);

  // log environment context
  try {
    const { execSync } = await import('node:child_process');
    const whoami = execSync('whoami', { encoding: 'utf8' }).trim();
    const id = execSync('id', { encoding: 'utf8' }).trim();
    console.log(`[System] Running as user: ${whoami} (${id})`);
  } catch {
    console.log('[System] Could not determine current user');
  }

  // fix git dubious ownership errors on linux (Railway volumes)
  try {
    const { execFileSync } = await import('node:child_process');
    const GIT_BIN = process.env.GIT_BIN_PATH || 'git';
    execFileSync(GIT_BIN, ['config', '--global', '--add', 'safe.directory', '*'], { timeout: 5000 });
    console.log('[System] Git safe.directory configured.');
  } catch (err) {
    console.warn('[System] Warning: Failed to set git safe.directory:', err);
  }

  const shouldSync = process.env.SYNC_REPOS_ON_STARTUP !== 'false';
  if (shouldSync) {
    console.log('[System] SYNC_REPOS_ON_STARTUP=true -> Reconciling repos...');
    await reconcileReposOnDisk().catch(err => {
      console.error('[System] Repo sync failed:', err);
    });
  } else {
    console.log('[System] SYNC_REPOS_ON_STARTUP=false -> Skipping sync.');
  }
});
