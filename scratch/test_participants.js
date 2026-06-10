const url = "https://evogo.erriesse.com/group/list";
const apikey = "e7ea6767f47747dcbbb00ff0517cc9e0";

async function checkParticipants() {
  const res = await fetch(url, {
    headers: {
      "apikey": apikey,
      "Content-Type": "application/json"
    }
  });
  const data = await res.json();
  const group = data.data?.[0] || data[0];
  if (group && group.Participants && group.Participants.length > 0) {
    console.log("Participant keys:", Object.keys(group.Participants[0]));
    console.log("Participant sample:", JSON.stringify(group.Participants[0], null, 2));
  } else {
    console.log("No participants found");
  }
}

checkParticipants().catch(console.error);
