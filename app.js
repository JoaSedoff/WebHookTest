const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

const GRAPH_API_VERSION = 'v26.0';

// Verificación inicial del webhook
app.get('/', (req, res) => {
  const {
    'hub.mode': mode,
    'hub.challenge': challenge,
    'hub.verify_token': token
  } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }

  res.status(403).end();
});


// Recibir eventos de WhatsApp
app.post('/', (req, res) => {
  const timestamp = new Date()
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  console.log(`\nWebhook received ${timestamp}`);
  console.log(JSON.stringify(req.body, null, 2));

  // Respondemos rápido a Meta
  res.status(200).end();

  // Procesamos después de responder
  processWebhook(req.body).catch(error => {
    console.error('Error procesando webhook:', error);
  });
});


async function processWebhook(body) {
  const change = body?.entry?.[0]?.changes?.[0];

  if (!change || change.field !== 'messages') {
    return;
  }

  const value = change.value;
  const message = value?.messages?.[0];

  // Puede ser un webhook de status y no un mensaje entrante
  if (!message) {
    return;
  }

  console.log(`Mensaje recibido de ${message.from}`);
  console.log(`Tipo: ${message.type}`);

  if (message.type === 'text') {
    console.log(`Texto: ${message.text.body}`);
    return;
  }

  if (message.type === 'image') {
    const mediaId = message.image.id;

    console.log(`Media ID: ${mediaId}`);

    await downloadWhatsAppMedia(mediaId);
  }
}


async function downloadWhatsAppMedia(mediaId) {
  // PASO 1:
  // Pedirle a Meta la URL temporal del archivo

  const metadataUrl =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}` +
    `?phone_number_id=${phoneNumberId}`;

  const metadataResponse = await fetch(metadataUrl, {
    headers: {
      Authorization: `Bearer ${whatsappToken}`
    }
  });

  if (!metadataResponse.ok) {
    const error = await metadataResponse.text();
    throw new Error(`Error obteniendo URL del media: ${error}`);
  }

  const metadata = await metadataResponse.json();

  console.log('URL temporal obtenida');
  console.log(`MIME type: ${metadata.mime_type}`);
  console.log(`Tamaño: ${metadata.file_size} bytes`);


  // PASO 2:
  // Descargar físicamente la imagen

  const mediaResponse = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${whatsappToken}`
    }
  });

  if (!mediaResponse.ok) {
    const error = await mediaResponse.text();
    throw new Error(`Error descargando media: ${error}`);
  }

  const arrayBuffer = await mediaResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);


  // PASO 3:
  // Guardar temporalmente el archivo

  const downloadsDir = path.join('/tmp', 'whatsapp-media');

  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const filename = `${mediaId}.jpg`;
  const filepath = path.join(downloadsDir, filename);

  fs.writeFileSync(filepath, buffer);

  console.log(`Imagen descargada correctamente: ${filepath}`);
}


app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
