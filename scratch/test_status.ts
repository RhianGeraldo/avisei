import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vxtccczafteyeclxdoqq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dGNjY3phZnRleWVjbHhkb3FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODIwMzAwMywiZXhwIjoyMDkzNzc5MDAzfQ.a9mvFFx3C2XYWpgDF6FEDS6D9SJC6hOycIv2I6dDYxI'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testStatus() {
  const { data: instance } = await supabase
    .from('instances')
    .select('*')
    .limit(1)
    .single()

  if (!instance) {
    console.error('No instance found')
    return
  }

  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', true)
    .single()

  if (!settings) {
    console.error('No settings found')
    return
  }

  console.log('Testing instance:', instance.instance_name)
  console.log('Using URL:', settings.evogo_url)

  const url = `${settings.evogo_url.replace(/\/+$/, '')}/instance/status`
  const options = {
    method: 'GET',
    headers: {
      'apikey': instance.evogo_api_key,
      'Content-Type': 'application/json'
    }
  }

  try {
    const res = await fetch(url, options)
    const text = await res.text()
    console.log('Status Code:', res.status)
    console.log('Response Body:', text)
    
    if (res.ok) {
        const json = JSON.parse(text);
        console.log('Parsed JSON:', json);
        // Simular o pickConnectionState
        const d = json.data ?? json;
        const i = json.instance ?? {};
        console.log('d:', d);
        console.log('i:', i);
        
        let found = undefined;
        for (const key of ["connected", "Connected", "isConnected"]) {
            if (key in d) found = d[key];
            else if (key in i) found = i[key];
            if (found !== undefined) break;
        }
        if (found === undefined) {
             for (const key of ["status", "state", "connectionStatus", "connectionState"]) {
                if (key in d && d[key] != null) found = d[key];
                else if (key in i && i[key] != null) found = i[key];
                else if (key in json && json[key] != null) found = json[key];
                if (found !== undefined) break;
            }
        }
        console.log('Found connection state:', found);
    }
  } catch (err) {
    console.error('Fetch Error:', err)
  }
}

testStatus()
