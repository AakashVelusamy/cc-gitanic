import 'dotenv/config';
import express from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler }  from './middleware/errorHandler';
import cors from 'cors';
import { initLogSubscribers } from './lib/logSubscribers';

// ── Bootstrap observers (must run before any routes fire) ────────────────────
initLogSubscribers();



const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Route mounts ──────────────────────────────────────────────────────────────
import authRouter     from './routes/auth';
import repoRouter     from './routes/repos';
import deployRouter   from './routes/deploy';
import gitRouter      from './routes/git';
import internalRouter from './routes/internal';

app.use('/api/auth',  authRouter);
app.use('/api/repos', repoRouter);
app.use('/api',       deployRouter);    // /api/repos/:repoName/deploy, /api/deployments/*
app.use('/git',       gitRouter);       // /git/:username/:repo.git/*
app.use('/internal',  internalRouter);  // /internal/deploy (hook → deploy trigger)



// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] Gitanic backend listening on port ${PORT}`);
});

export default app;
