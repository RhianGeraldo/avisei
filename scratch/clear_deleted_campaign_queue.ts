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
  console.log('Checking for orphaned messages in send_queue...');
  
  const { data: queueItems, error: qErr } = await supabase
    .from('send_queue')
    .select('id, campaign_id')
    .in('status', ['pending', 'processing']);

  if (qErr) {
    console.error('Error fetching queue:', qErr);
    return;
  }

  const { data: campaigns, error: cErr } = await supabase
    .from('campaigns')
    .select('id');

  if (cErr) {
    console.error('Error fetching campaigns:', cErr);
    return;
  }

  const validCampaignIds = new Set(campaigns.map(c => c.id));
  
  const invalidQueueIds = queueItems
    .filter(q => q.campaign_id && !validCampaignIds.has(q.campaign_id))
    .map(q => q.id);

  console.log(`Found ${invalidQueueIds.length} orphaned messages in send_queue.`);

  if (invalidQueueIds.length > 0) {
    const { error: delErr } = await supabase
      .from('send_queue')
      .delete()
      .in('id', invalidQueueIds);
      
    if (delErr) {
      console.error('Error deleting orphaned messages:', delErr);
    } else {
      console.log('Successfully deleted orphaned messages.');
    }
  } else {
      console.log('No invalid queue ids found.');
  }
}
run();
