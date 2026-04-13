// development deployment trigger script
// manually enqueues build jobs for specified repositories
// facilitates testing of pipeline strategies in dev mode
// orchestrates user and repository resolution via database
import 'dotenv/config';
import { DeploymentService } from './src/modules/deployment/deployment.service';
import { query } from './src/lib/db';

interface UserRepoRow {
  uid: string;
  rid: string;
}

// dev-only script: manually trigger a deployment for a given user/repo pair
async function run(): Promise<void> {
  const username = process.env.DEV_USERNAME ?? 'aakashvelusamy';
  const repoName = process.env.DEV_REPO ?? 'temp';

  const rows = await query<UserRepoRow>(
    `SELECT u.id as uid, r.id as rid
       FROM repositories r
       JOIN users u ON u.id = r.owner_id
      WHERE u.username = $1 AND r.name = $2`,
    [username, repoName]
  );

  if (rows.length === 0) {
    console.error(`No repo found for ${username}/${repoName}`);
    process.exit(1);
  }

  const { uid, rid } = rows[0];
  const result = await DeploymentService.enqueue(uid, rid);
  console.log('Enqueued ID:', result.deploymentId);
  setTimeout(() => process.exit(0), 4_000);
}

run().catch((err) => {
  console.error('run_deploy failed:', err);
  process.exit(1);
});
