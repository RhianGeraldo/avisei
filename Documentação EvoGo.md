# Documentação EvoGo

## Instance

### Create Instance

**Rota:** `POST {{host}}/instance/create`

#### Exemplo de Body JSON
```json
{
"instanceId": "{{instance}}", // opicional
"name": "teste",
"token": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1014"
// "proxy": {
//     "host": ""
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/instance/create' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"instanceId": "{{instance}}", "name": "teste", "token": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1014"}'
```

---

### Fetch All Instances

**Rota:** `GET {{host}}/instance/all`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/instance/all' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Fetch Instance

**Rota:** `GET {{host}}/instance/info/:instanceId`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/instance/info/:instanceId' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Get logs

**Rota:** `GET {{host}}/instance/logs/:instanceId?start_date=2025-04-11&end_date=2025-04-17&level=DEBUG,WARN,ERROR,INFO&limit=50`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/instance/logs/:instanceId?start_date=2025-04-11&end_date=2025-04-17&level=DEBUG,WARN,ERROR,INFO&limit=50' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Delete Instance

**Rota:** `DELETE {{host}}/instance/delete/:instanceId`

#### Exemplo de cURL
```bash
curl --request DELETE \
  --url '{{host}}/instance/delete/:instanceId' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Delete Proxy

**Rota:** `DELETE {{host}}/instance/proxy/:instanceId`

#### Exemplo de cURL
```bash
curl --request DELETE \
  --url '{{host}}/instance/proxy/:instanceId' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Instance Connect

**Rota:** `POST {{host}}/instance/connect`

#### Exemplo de Body JSON
```json
{
"subscribe": [
// "MESSAGE",
// "READ_RECEIPT",
// "PRESENCE",
// "HISTORY_SYNC",
// "CHAT_PRESENCE",
// "CALL",
// "CONNECTION",
// "QRCODE",
// "LABEL",
// "CONTACT",
// "GROUP",
// "NEWSLETTER"
"ALL"
],
// "websocketEnable": "disabled",
// "rabbitmqEnable": "enabled",
// "natsEnable": "disabled",
"webhookUrl": "https://originators-api-dev.bizpik.com.br/api/evogo/webhook"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/instance/connect' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "subscribe": [ "ALL" ], "webhookUrl": "https: }'
```

---

### Get Status

**Rota:** `GET {{host}}/instance/status`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/instance/status' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Get QR

**Rota:** `GET {{host}}/instance/qr`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/instance/qr' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Pairing Code

**Rota:** `POST {{host}}/instance/pair`

#### Exemplo de Body JSON
```json
{
"phone": "+5511918798714"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/instance/pair' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"phone": "+5511918798714"}'
```

---

### Disconnect

**Rota:** `POST {{host}}/instance/disconnect`

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/instance/disconnect' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Reconnect

**Rota:** `POST {{host}}/instance/reconnect`

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/instance/reconnect' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Logout

**Rota:** `DELETE {{host}}/instance/logout`

#### Exemplo de cURL
```bash
curl --request DELETE \
  --url '{{host}}/instance/logout' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Force Reconnect

**Rota:** `POST {{host}}/instance/forcereconnect/:instanceId`

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/instance/forcereconnect/:instanceId' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Get Advanced Settings

**Rota:** `GET {{host}}/instance/:instanceId/advanced-settings`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/instance/:instanceId/advanced-settings' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Update Advanced Settings

**Rota:** `PUT {{host}}/instance/:instanceId/advanced-settings`

#### Exemplo de Body JSON
```json
{
"rejectCalls": false,
"rejectCallMessage": "",
"readMessages": false,
"readStatus": false,
"alwaysOnline": false
}
```

#### Exemplo de cURL
```bash
curl --request PUT \
  --url '{{host}}/instance/:instanceId/advanced-settings' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"rejectCalls": false, "rejectCallMessage": "", "readMessages": false, "readStatus": false, "alwaysOnline": false}'
```

---

## Send Message

### Send Text

**Rota:** `POST {{host}}/send/text`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"text": "mensagem de teste",
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/text' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "text": "mensagem de teste", "delay": 1000}'
```

---

### Send Link

**Rota:** `POST {{host}}/send/link`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"text": "mensagem de teste https://agenciadgcode.com",
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/link' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "number": "5511999999999", "text": "mensagem de teste https: "delay": 1000 }'
```

---

### Send Media URL

**Rota:** `POST {{host}}/send/media`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
// O campo "url" aceita URL HTTP(S) OU mídia em base64 (sem prefixo data:).
// Se não começar com http:// ou https://, é decodificado como base64.
"url": "https://evolution-api.com/files/evolution-api.pdf",
// Exemplo base64:
// "url": "JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwv...",
"caption": "teste de mensagem",
"filename": "arquivo.pdf",
"type": "document",
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/media' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "number": "5511999999999", "url": "https: "caption": "teste de mensagem", "filename": "arquivo.pdf", "type": "document", "delay": 1000 }'
```

---

### Send Poll

**Rota:** `POST {{host}}/send/poll`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"question": "teste de mensagem",
"maxAnswer": 4,
"options": [
"option1",
"option2"
],
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/poll' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "question": "teste de mensagem", "maxAnswer": 4, "options": ["option1", "option2"], "delay": 1000}'
```

---

### Send Sticker

**Rota:** `POST {{host}}/send/sticker`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"sticker": "https://evolution-api.com/files/sticker.png",
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/sticker' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "number": "5511999999999", "sticker": "https: "delay": 1000 }'
```

---

### Send Location

**Rota:** `POST {{host}}/send/location`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"name": "Bora Bora",
"address": "French Polynesian",
"latitude": -16.505538233564373,
"longitude": -151.7422770494996,
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/location' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "name": "Bora Bora", "address": "French Polynesian", "latitude": -16.505538233564373, "longitude": -151.7422770494996, "delay": 1000}'
```

---

### Send Contact

**Rota:** `POST {{host}}/send/contact`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"vcard": {
"fullName": "Davidson Gomes",
"organization": "AtendAI",
"phone": "5511999999999"
},
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/contact' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "vcard": {"fullName": "Davidson Gomes", "organization": "AtendAI", "phone": "5511999999999"}, "delay": 1000}'
```

---

### Send Button

**Rota:** `POST {{host}}/send/button`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"title": "Whatsmeow",
"description": "botão pela whatsmeow",
"footer": "Clique nos botões",
"buttons": [
{
"type": "pix",
"currency": "BRL",
"name": "Davidson Gomes",
"keyType": "random", /* phone, email, cpf, cnpj, random  */
"key": "0ea59ac5-f001-4f0e-9785-c772200f1b1e"
}
// {
//     "type": "reply",
//     "displayText": "Resposta 1",
//     "id": "1"
// },
// {
//     "type": "reply",
//     "displayText": "Resposta 2",
//     "id": "2"
// },
// {
//     "type": "copy",
//     "displayText": "Copia Código",
//     "copyCode": "ZXN0ZSDDqSB1bSBjw7NkaWdvIGRlIHRleHRvIGNvcGnDoXZlbC4="
// },
// {
//     "type": "url",
//     "displayText": "Evolution API",
//     "url": "http://evolution-api.com"
// },
// {
//     "type": "call",
//     "displayText": "Me ligue",
//     "phoneNumber": "557499879409"
// }
],
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/button' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "title": "Whatsmeow", "description": "bot\u00e3o pela whatsmeow", "footer": "Clique nos bot\u00f5es", "buttons": [{"type": "pix", "currency": "BRL", "name": "Davidson Gomes", "keyType": "random", "key": "0ea59ac5-f001-4f0e-9785-c772200f1b1e"}], "delay": 1000}'
```

---

### Send List

**Rota:** `POST {{host}}/send/list`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"title": "List Title",
"description": "List description",
"buttonText": "Click Here",
"footerText": "footer list",
"sections": [
{
"title": "Row tilte 01",
"rows": [
{
"title": "Title row 01",
"description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,",
"rowId": "rowId 001"
},
{
"title": "Title row 02",
"description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,",
"rowId": "rowId 002"
}
]
},
{
"title": "Row tilte 02",
"rows": [
{
"title": "Title row 01",
"description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,",
"rowId": "rowId 001"
},
{
"title": "Title row 02",
"description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,",
"rowId": "rowId 002"
}
]
}
],
"delay": 1000
// "mentionedJid": "557499879409@s.whatsapp.net",
// "mentionAll": true
// "quoted": {
//     "messageId": "3EB00E86C964FE604AF39A",
//     "participant": "557499879409@s.whatsapp.net"
// }
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/list' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "title": "List Title", "description": "List description", "buttonText": "Click Here", "footerText": "footer list", "sections": [{"title": "Row tilte 01", "rows": [{"title": "Title row 01", "description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,", "rowId": "rowId 001"}, {"title": "Title row 02", "description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,", "rowId": "rowId 002"}]}, {"title": "Row tilte 02", "rows": [{"title": "Title row 01", "description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,", "rowId": "rowId 001"}, {"title": "Title row 02", "description": "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s,", "rowId": "rowId 002"}]}], "delay": 1000}'
```

---

### Send Carousel

**Rota:** `POST {{host}}/send/carousel`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"text": "Confira nossos produtos",
"cards": [
{
"image": "https://evolution-api.com/files/card1.jpg",
"text": "Produto 1",
"footer": "Oferta exclusiva",
"buttons": [
{
"type": "reply",
"displayText": "Quero saber mais",
"id": "card1_reply"
},
{
"type": "url",
"displayText": "Ver site",
"url": "https://evolution-api.com"
}
]
},
{
"image": "https://evolution-api.com/files/card2.jpg",
"text": "Produto 2",
"footer": "Promoção",
"buttons": [
{
"type": "reply",
"displayText": "Comprar",
"id": "card2_buy"
}
]
}
],
"delay": 1000
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/send/carousel' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "number": "5511999999999", "text": "Confira nossos produtos", "cards": [ { "image": "https: "text": "Produto 1", "footer": "Oferta exclusiva", "buttons": [ { "type": "reply", "displayText": "Quero saber mais", "id": "card1_reply" }, { "type": "url", "displayText": "Ver site", "url": "https: } ] }, { "image": "https: "text": "Produto 2", "footer": "Promoção", "buttons": [ { "type": "reply", "displayText": "Comprar", "id": "card2_buy" } ] } ], "delay": 1000 }'
```

---

## User

### User Info

**Rota:** `POST {{host}}/user/info`

#### Exemplo de Body JSON
```json
{
"number": [
"5511999999999"
]
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/info' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": ["5511999999999"]}'
```

---

### Check User

**Rota:** `POST {{host}}/user/check`

#### Exemplo de Body JSON
```json
{
"number": [
"5511999999999"
]
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/check' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": ["5511999999999"]}'
```

---

### Get Avatar

**Rota:** `POST {{host}}/user/avatar`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"preview": false
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/avatar' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "preview": false}'
```

---

### Get Contacts

**Rota:** `GET {{host}}/user/contacts`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/user/contacts' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Get Privacy Settings

**Rota:** `GET {{host}}/user/privacy`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/user/privacy' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Block Contact

**Rota:** `POST {{host}}/user/block`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/block' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999"}'
```

---

### UnBlock Contact

**Rota:** `POST {{host}}/user/unblock`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/unblock' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999"}'
```

---

### Block List

**Rota:** `GET {{host}}/user/blocklist`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/user/blocklist' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Set Profile Picture

**Rota:** `POST {{host}}/user/profilePicture`

#### Exemplo de Body JSON
```json
{
"image": "https://i.etsystatic.com/43909860/r/il/6ae03d/5002111235/il_570xN.5002111235_foat.jpg"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/profilePicture' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "image": "https: }'
```

---

### Set Profile Name

**Rota:** `POST {{host}}/user/profileName`

#### Exemplo de Body JSON
```json
{
"name": "Davidson Gomes"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/profileName' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"name": "Davidson Gomes"}'
```

---

### Set Profile Status

**Rota:** `POST {{host}}/user/profileStatus`

#### Exemplo de Body JSON
```json
{
"status": "Disponível"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/user/profileStatus' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"status": "Dispon\u00edvel"}'
```

---

## Message

### React a Message

**Rota:** `POST {{host}}/message/react`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"id": "3EB08443D6D1D27E1D48B1",
"reaction": "🔥"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/react' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "id": "3EB08443D6D1D27E1D48B1", "reaction": "\ud83d\udd25"}'
```

---

### Send Presence

**Rota:** `POST {{host}}/message/presence`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"state": "composing", /* composing, paused */
"isAudio": true
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/presence' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "state": "composing", "isAudio": true}'
```

---

### Mark as Read

**Rota:** `POST {{host}}/message/markread`

#### Exemplo de Body JSON
```json
{
"number": "5511999999999",
"id": ["3EB00921B31193E2DB2370", "3EB08712BD584101105EC9"]
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/markread' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"number": "5511999999999", "id": ["3EB00921B31193E2DB2370", "3EB08712BD584101105EC9"]}'
```

---

### Download Media

**Rota:** `POST {{host}}/message/downloadmedia`

#### Exemplo de Body JSON
```json
{
"message": {
"imageMessage": {
"URL": "https://mmg.whatsapp.net/o1/v/t62.7118-24/f1/m232/up-oil-image-ab662828-556a-4b8f-bfff-394223de6535?ccb=9-4&oh=01_Q5AaIGK4LtTcfqHxYiyr2lgN4Suzsorlule_mQFBemcVhBty&oe=673773A1&_nc_sid=e6ed6c&mms3=true",
"directPath": "/o1/v/t62.7118-24/f1/m232/up-oil-image-ab662828-556a-4b8f-bfff-394223de6535?ccb=9-4&oh=01_Q5AaIGK4LtTcfqHxYiyr2lgN4Suzsorlule_mQFBemcVhBty&oe=673773A1&_nc_sid=e6ed6c",
"mediaKey": "wbFx7x7ou9z3BKjCN8lmf66FqfCivT6uzRln+epd1yk=",
"mimetype": "image/jpeg",
"fileEncSHA256": "PBHUgEC4XUQHO99lxQjMRvu6xLHyilVTzXu1T8PiM+E=",
"fileSHA256": "1QUQbJE44Xr4PiirRREsp6fa9RY8vjVttjjBvF0feCM=",
"fileLength": 13596
}
}
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/downloadmedia' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "message": { "imageMessage": { "URL": "https: "directPath": "/o1/v/t62.7118-24/f1/m232/up-oil-image-ab662828-556a-4b8f-bfff-394223de6535?ccb=9-4&oh=01_Q5AaIGK4LtTcfqHxYiyr2lgN4Suzsorlule_mQFBemcVhBty&oe=673773A1&_nc_sid=e6ed6c", "mediaKey": "wbFx7x7ou9z3BKjCN8lmf66FqfCivT6uzRln+epd1yk=", "mimetype": "image/jpeg", "fileEncSHA256": "PBHUgEC4XUQHO99lxQjMRvu6xLHyilVTzXu1T8PiM+E=", "fileSHA256": "1QUQbJE44Xr4PiirRREsp6fa9RY8vjVttjjBvF0feCM=", "fileLength": 13596 } } }'
```

---

### Get Message Status

**Rota:** `POST {{host}}/message/status`

#### Exemplo de Body JSON
```json
{
"id": "3EB0078FCA3E48FC70D761"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/status' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"id": "3EB0078FCA3E48FC70D761"}'
```

---

### Delete Message

**Rota:** `POST {{host}}/message/delete`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net",
"messageId": "3EB0078FCA3E48FC70D761"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/delete' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net", "messageId": "3EB0078FCA3E48FC70D761"}'
```

---

### Edit Message

**Rota:** `POST {{host}}/message/edit`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net",
"messageId": "3EB0CAEDE886F69B2BF4A7",
"message": "mensagem editada"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/message/edit' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net", "messageId": "3EB0CAEDE886F69B2BF4A7", "message": "mensagem editada"}'
```

---

## Chat

### Pin Chat

**Rota:** `POST {{host}}/chat/pin`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/pin' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net"}'
```

---

### UnPin Chat

**Rota:** `POST {{host}}/chat/unpin`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/unpin' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net"}'
```

---

### Archive Chat

**Rota:** `POST {{host}}/chat/archive`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/archive' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net"}'
```

---

### Unarchive Chat

**Rota:** `POST {{host}}/chat/unarchive`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/unarchive' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net"}'
```

---

### Mute Chat

**Rota:** `POST {{host}}/chat/mute`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/mute' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net"}'
```

---

### Unmute Chat

**Rota:** `POST {{host}}/chat/unmute`

#### Exemplo de Body JSON
```json
{
"chat": "5511999999999@s.whatsapp.net"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/unmute' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"chat": "5511999999999@s.whatsapp.net"}'
```

---

### History Sync Request

**Rota:** `POST {{host}}/chat/history-sync`

#### Exemplo de Body JSON
```json
{
"messageInfo": {
"Chat": "120363026465248932@g.us",
"ID": "4B320468A81169EEC9E72DF66382169D",
"IsFromMe": false,
"IsGroup": true,
"Timestamp": "2025-02-19T13:07:15-03:00"
},
"count": 10
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/chat/history-sync' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"messageInfo": {"Chat": "120363026465248932@g.us", "ID": "4B320468A81169EEC9E72DF66382169D", "IsFromMe": false, "IsGroup": true, "Timestamp": "2025-02-19T13:07:15-03:00"}, "count": 10}'
```

---

## Group

### List Groups

**Rota:** `GET {{host}}/group/list`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/group/list' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Get Group Info

**Rota:** `POST {{host}}/group/info`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363314613377653@g.us"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/info' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupJid": "120363314613377653@g.us"}'
```

---

### Get Group Invite Link

**Rota:** `POST {{host}}/group/invitelink`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363281584341832@g.us"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/invitelink' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupJid": "120363281584341832@g.us"}'
```

---

### Set Group Picture

**Rota:** `POST {{host}}/group/photo`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363281584341832@g.us",
"image": "https://i.etsystatic.com/43909860/r/il/6ae03d/5002111235/il_570xN.5002111235_foat.jpg"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/photo' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{ "groupJid": "120363281584341832@g.us", "image": "https: }'
```

---

### Set Group Name

**Rota:** `POST {{host}}/group/name`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363281584341832@g.us",
"name": "Teste"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/name' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupJid": "120363281584341832@g.us", "name": "Teste"}'
```

---

### Set Group Description

**Rota:** `POST {{host}}/group/description`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363281584341832@g.us",
"description": "Descrição do grupo"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/description' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupJid": "120363281584341832@g.us", "description": "Descri\u00e7\u00e3o do grupo"}'
```

---

### Create Group

**Rota:** `POST {{host}}/group/create`

#### Exemplo de Body JSON
```json
{
"groupName": "Teste Whatsmeow",
"participants": [
"557499879409"
]
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/create' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupName": "Teste Whatsmeow", "participants": ["557499879409"]}'
```

---

### Update Participant

**Rota:** `POST {{host}}/group/participant`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363332413160732@g.us",
"participants": [
"557499879409"
],
"action": "demote" /* add, remove, promote, demote */
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/participant' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupJid": "120363332413160732@g.us", "participants": ["557499879409"], "action": "demote"}'
```

---

### Get My Groups

**Rota:** `GET {{host}}/group/myall`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/group/myall' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Join Group Link

**Rota:** `POST {{host}}/group/join`

#### Exemplo de Body JSON
```json
{
"code": ""
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/join' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"code": ""}'
```

---

### Leave Group

**Rota:** `POST {{host}}/group/leave`

#### Exemplo de Body JSON
```json
{
"groupJid": "120363281584341832@g.us"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/group/leave' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"groupJid": "120363281584341832@g.us"}'
```

---

## Call

### Reject Call

**Rota:** `POST {{host}}/call/reject`

#### Exemplo de Body JSON
```json
{
"callCreator": "557499879409@s.whatsapp.net",
"callId": "EA25BF75464586B0DA8AAF03B74D1AE8"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/call/reject' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"callCreator": "557499879409@s.whatsapp.net", "callId": "EA25BF75464586B0DA8AAF03B74D1AE8"}'
```

---

## Community

### Create Community

**Rota:** `POST {{host}}/community/create`

#### Exemplo de Body JSON
```json
{
"communityName": "Teste Whatsmeow"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/community/create' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"communityName": "Teste Whatsmeow"}'
```

---

### Add Group to Community

**Rota:** `POST {{host}}/community/add`

#### Exemplo de Body JSON
```json
{
"communityJid": "120363331164431348@g.us",
"groupJid": ["120363332413160732@g.us"]
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/community/add' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"communityJid": "120363331164431348@g.us", "groupJid": ["120363332413160732@g.us"]}'
```

---

### Remove Group to Community

**Rota:** `POST {{host}}/community/remove`

#### Exemplo de Body JSON
```json
{
"communityJid": "120363331164431348@g.us",
"groupJid": ["120363332413160732@g.us"]
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/community/remove' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"communityJid": "120363331164431348@g.us", "groupJid": ["120363332413160732@g.us"]}'
```

---

## Label

### Add Label on Chat

**Rota:** `POST {{host}}/label/chat`

#### Exemplo de Body JSON
```json
{
"jid": "557498028235@s.whatsapp.net",
"labelId": "8"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/label/chat' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "557498028235@s.whatsapp.net", "labelId": "8"}'
```

---

### Remove Label on Chat

**Rota:** `POST {{host}}/unlabel/chat`

#### Exemplo de Body JSON
```json
{
"jid": "557498028235@s.whatsapp.net",
"labelId": "8"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/unlabel/chat' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "557498028235@s.whatsapp.net", "labelId": "8"}'
```

---

### Add Label on Message

**Rota:** `POST {{host}}/label/message`

#### Exemplo de Body JSON
```json
{
"jid": "120363331164431348@g.us",
"messageId": "",
"labelId": ""
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/label/message' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "120363331164431348@g.us", "messageId": "", "labelId": ""}'
```

---

### Remove Label on Message

**Rota:** `POST {{host}}/unlabel/message`

#### Exemplo de Body JSON
```json
{
"jid": "120363331164431348@g.us",
"messageId": "",
"labelId": ""
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/unlabel/message' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "120363331164431348@g.us", "messageId": "", "labelId": ""}'
```

---

### Edit Label

**Rota:** `POST {{host}}/label/edit`

#### Exemplo de Body JSON
```json
{
"labelId": "",
"name": "label",
"color": 1,
"deleted": true
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/label/edit' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"labelId": "", "name": "label", "color": 1, "deleted": true}'
```

---

### List Labels

**Rota:** `GET {{host}}/label/list`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/label/list' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

## Newsletter

### Create Newsletter

**Rota:** `POST {{host}}/newsletter/create`

#### Exemplo de Body JSON
```json
{
"name": "Teste Whatsmewo",
"description": "teste"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/newsletter/create' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"name": "Teste Whatsmewo", "description": "teste"}'
```

---

### List Newsletters

**Rota:** `GET {{host}}/newsletter/list`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/newsletter/list' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

### Get Newsletter Info

**Rota:** `POST {{host}}/newsletter/info`

#### Exemplo de Body JSON
```json
{
"jid": "120363316177781703@newsletter"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/newsletter/info' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "120363316177781703@newsletter"}'
```

---

### Get Newsletter Link

**Rota:** `POST {{host}}/newsletter/link`

#### Exemplo de Body JSON
```json
{
"key": "0029VajBUmtAjPXGt6uLYA10"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/newsletter/link' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"key": "0029VajBUmtAjPXGt6uLYA10"}'
```

---

### Subscribe on Newsletter

**Rota:** `POST {{host}}/newsletter/subscribe`

#### Exemplo de Body JSON
```json
{
"jid": "120363316177781703@newsletter"
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/newsletter/subscribe' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "120363316177781703@newsletter"}'
```

---

### Get Newsletter Messages

**Rota:** `POST {{host}}/newsletter/messages`

#### Exemplo de Body JSON
```json
{
"jid": "120363316177781703@newsletter",
"count": 1
}
```

#### Exemplo de cURL
```bash
curl --request POST \
  --url '{{host}}/newsletter/messages' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json' \
  --data '{"jid": "120363316177781703@newsletter", "count": 1}'
```

---

## Polls

### Get Poll Results

**Rota:** `GET {{host}}/polls/:pollMessageId/results`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/polls/:pollMessageId/results' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

## Server

### Server Health

**Rota:** `GET {{host}}/server/ok`

#### Exemplo de cURL
```bash
curl --request GET \
  --url '{{host}}/server/ok' \
  --header 'apikey: {{token}}' \
  --header 'Content-Type: application/json'
```

---

