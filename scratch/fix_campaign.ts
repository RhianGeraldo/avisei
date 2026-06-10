import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fixCampaign() {
  const campaignId = '11f61249-1dc3-406e-826d-2d4e68e0d297'; // I need to find the full ID
  // ...
}
