const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const env = fs.readFileSync('.env', 'utf-8');
  const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const supabaseKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: settings } = await supabase.from('app_settings').select('evogo_url, evogo_admin_token').single();
  const { data: inst } = await supabase.from('instances').select('evogo_api_key').eq('status', 'connected').limit(1).single();

  if (!inst) {
    console.log("Nenhuma instancia conectada");
    return;
  }

  const url = `${settings.evogo_url}/send/media`;
  console.log("Testing EvoGo URL:", url);

  // Test 1: no filename
  let res1 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': inst.evogo_api_key },
    body: JSON.stringify({
      number: '5544991529987',
      url: 'https://vxtccczafteyeclxdoqq.supabase.co/storage/v1/object/public/messages/i0e9smbswc.jpeg',
      type: 'image',
      caption: 'Test 1'
    })
  });
  console.log("Test 1 (no filename):", res1.status, await res1.text());

  // Test 2: with filename
  let res2 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': inst.evogo_api_key },
    body: JSON.stringify({
      number: '5544991529987',
      url: 'https://vxtccczafteyeclxdoqq.supabase.co/storage/v1/object/public/messages/i0e9smbswc.jpeg',
      type: 'image',
      caption: 'Test 2',
      filename: 'image.jpg'
    })
  });
  console.log("Test 2 (with filename):", res2.status, await res2.text());
}
run();
