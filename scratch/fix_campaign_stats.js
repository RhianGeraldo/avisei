require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, total_contacts, sent_count, failed_count').ilike('id', '11f61249%');
  const campaign = campaigns[0];
  console.log("Campaign ID:", campaign.id);

  const { count: realSent } = await supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'sent');
  const { count: realFailed } = await supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'failed');
  const { count: realPending } = await supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'pending');
  
  console.log(`Real stats -> Sent: ${realSent}, Failed: ${realFailed}, Pending: ${realPending}`);

  if (realPending > 0) {
    const { data: pendingContacts } = await supabase.from('campaign_contacts').select('*').eq('campaign_id', campaign.id).eq('status', 'pending');
    const { data: campDetails } = await supabase.from('campaigns').select('company_id, unit_id, instance_id, message_id, interval_seconds, messages(template, message_type, content_data)').eq('id', campaign.id).single();
    
    if (campDetails && pendingContacts) {
      console.log(`Re-enqueuing ${pendingContacts.length} contacts...`);
      const interval = campDetails.interval_seconds || 30;
      const startTime = new Date();
      
      const queueItems = pendingContacts.map((contact, i) => {
        return {
          company_id: campDetails.company_id,
          unit_id: campDetails.unit_id,
          instance_id: campDetails.instance_id,
          message_id: campDetails.message_id,
          contact_id: contact.id,
          campaign_id: campaign.id,
          number: contact.number.replace(/\D/g, ""),
          text: campDetails.messages ? campDetails.messages.template : "",
          message_type: campDetails.messages ? campDetails.messages.message_type : "text",
          content_data: campDetails.messages ? campDetails.messages.content_data : null,
          status: "pending",
          scheduled_at: new Date(startTime.getTime() + (i * interval * 1000)).toISOString(),
          trigger_source: "campaign"
        };
      });
      
      await supabase.from('send_queue').insert(queueItems);
    }
  }

  await supabase.from('campaigns').update({
    sent_count: realSent,
    failed_count: realFailed,
    status: realPending > 0 ? 'running' : 'completed'
  }).eq('id', campaign.id);

  console.log("Fixed!");
}
run();
