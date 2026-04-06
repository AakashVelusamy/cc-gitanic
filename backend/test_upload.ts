import 'dotenv/config';
import { supabase } from './src/lib/supabase';
import fs from 'fs';
async function run() {
  const buffer = fs.readFileSync('C:/admin/github/gitanic/backend/package.json');
  console.log('putting html..');
  const res = await supabase.storage.from('deployments').upload('test/test.html', buffer, { contentType: 'text/html; charset=utf-8', upsert: true });
  console.log(res);
  process.exit();
}
run();
