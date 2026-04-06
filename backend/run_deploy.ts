import 'dotenv/config';
import { DeploymentService } from './src/modules/deployment/deployment.service';
import { query } from './src/lib/db';
async function run() {
  const res = await query<any>("SELECT u.id as uid, r.id as rid FROM repositories r JOIN users u ON u.id = r.owner_id WHERE u.username='aakashvelusamy' AND r.name='temp'");
  const {uid, rid} = res[0];
  console.log('Enqueued ID:', (await DeploymentService.enqueue(uid, rid)).deploymentId);
  setTimeout(() => process.exit(0), 4000);
}
run();
