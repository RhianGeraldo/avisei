const url = "https://evogo.erriesse.com/group/myall";
const apikey = "239bdb07a3be4995bf0a959851f78a92";

async function fetchGroups() {
  console.log("Fetching", url);
  const res = await fetch(url, {
    headers: {
      "apikey": apikey,
      "Content-Type": "application/json"
    }
  });
  console.log("Status:", res.status);
  const body = await res.text();
  console.log("Body length:", body.length);
  console.log("Body sample:", body.substring(0, 1000));
}

fetchGroups().catch(console.error);
