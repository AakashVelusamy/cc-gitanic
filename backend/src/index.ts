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

// Bootstrap observers (must run before any routes fire)
initLogSubscribers();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// CORS: restrict to known origins; credentials require explicit origin (not wildcard)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
  credentials: true,
}));
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
});

// IMPORTANT: Mount /git BEFORE body parsers! git-http-backend needs raw streaming bodies.
app.use('/git', gitRouter);

// Now apply body parsers for the rest of the API
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Route mounts
app.use('/api/auth',  authRouter);
app.use('/api/repos', repoRouter);
app.use('/api',       deployRouter);
app.use('/internal',  internalRouter);

// Error Handler
app.use(errorHandler);

// Server Startup
app.listen(PORT, async () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);
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
