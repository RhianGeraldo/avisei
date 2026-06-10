import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Find the campaign
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, total_contacts, sent_count, failed_count').ilike('id', '11f61249%');
  if (!campaigns || campaigns.length === 0) {
    console.error("Campaign not found");
    return;
  }
  
  const campaign = campaigns[0];
  console.log("Found campaign:", campaign);

  // Recalculate true stats based on campaign_contacts
  const { count: realSent } = await supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'sent');
  const { count: realFailed } = await supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'failed');
  const { count: realPending } = await supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'pending');
  
  console.log(`Real stats -> Sent: ${realSent}, Failed: ${realFailed}, Pending: ${realPending}`);

  // Re-enqueue the pending ones
  if (realPending && realPending > 0) {
    const { data: pendingContacts } = await supabase.from('campaign_contacts').select('*').eq('campaign_id', campaign.id).eq('status', 'pending');
    
    // Get campaign details for queue
    const { data: campDetails } = await supabase.from('campaigns').select('company_id, unit_id, instance_id, message_id, interval_seconds, messages(template, message_type, content_data)').eq('id', campaign.id).single();
    
    if (campDetails && pendingContacts) {
      console.log(`Re-enqueuing ${pendingContacts.length} contacts...`);
      const interval = campDetails.interval_seconds || 30;
      const startTime = new Date();
      
      const queueItems = pendingContacts.map((contact, i) => {
        // Need to replace variables here in a real scenario, but let's just use the template for now, 
        // wait, I can just use the server action or lib function to re-launch!
        return {
          company_id: campDetails.company_id,
          unit_id: campDetails.unit_id,
          instance_id: campDetails.instance_id,
          message_id: campDetails.message_id,
          contact_id: contact.id,
          campaign_id: campaign.id,
          number: contact.number.replace(/\D/g, ""),
          text: (campDetails.messages as any)?.template || "",
          message_type: (campDetails.messages as any)?.message_type || "text",
          content_data: (campDetails.messages as any)?.content_data,
          status: "pending",
          scheduled_at: new Date(startTime.getTime() + (i * interval * 1000)).toISOString(),
          trigger_source: "campaign"
        };
      });
      
      await supabase.from('send_queue').insert(queueItems);
    }
  }

  // Update campaign
  await supabase.from('campaigns').update({
    sent_count: realSent,
    failed_count: realFailed,
    status: realPending && realPending > 0 ? 'running' : 'completed'
  }).eq('id', campaign.id);

  console.log("Campaign fixed!");
}

run();
