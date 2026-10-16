import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, ...value] = line.split('=');
  if (key && value.length > 0) {
    acc[key.trim()] = value.join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {} as any);

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('send_queue')
    .select('id')
    .is('campaign_id', null)
    .in('status', ['pending', 'processing']);
    
  if (error) console.error(error);
  else {
    console.log(`Found ${data.length} pending messages with no campaign_id.`);
    if (data.length > 0) {
      // Let's delete them to be safe if they are orphan messages the user wants stopped
      console.log('Deleting them...');
      const { error: delErr } = await supabase
        .from('send_queue')
        .delete()
        .is('campaign_id', null)
        .in('status', ['pending', 'processing']);
      if (delErr) console.error(delErr);
      else console.log('Deleted null campaign messages.');
    }
  }
}
run();
