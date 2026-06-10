const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('contacts').select('*');
  console.log('Contacts:', data?.length || 0, error);
  if (data && data.length > 0) {
    console.log('First contact:', data[0]);
  }
}
run();
