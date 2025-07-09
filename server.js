const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==============================================
// 1. CONFIGURAÇÃO DE AMBIENTE E CHAVE DE CRIPTOGRAFIA
// ==============================================

// Função para garantir que a chave de criptografia exista no arquivo .env
function setupEncryptionKey() {
  const envPath = path.resolve(__dirname, '.env');
  
  try {
    // Verifica se o arquivo .env existe
    if (!fs.existsSync(envPath)) {
      console.log('Arquivo .env não encontrado. Criando um novo...');
      // Gera uma nova chave segura
      const newKey = crypto.randomBytes(32).toString('hex');
      // Escreve o arquivo .env com a nova chave
      fs.writeFileSync(envPath, `ENCRYPTION_KEY=${newKey}\n`);
      console.log('✅ Nova chave de criptografia gerada e salva no arquivo .env.');
    } else {
      // Se o arquivo existe, lê seu conteúdo
      const content = fs.readFileSync(envPath, 'utf8');
      // Verifica se a chave já está definida
      if (!content.includes('ENCRYPTION_KEY=')) {
        console.log('Chave ENCRYPTION_KEY não encontrada no .env. Adicionando...');
        const newKey = crypto.randomBytes(32).toString('hex');
        // Adiciona a chave ao final do arquivo, preservando o conteúdo existente
        fs.appendFileSync(envPath, `\nENCRYPTION_KEY=${newKey}\n`);
        console.log('✅ Nova chave de criptografia adicionada ao arquivo .env.');
      } else {
        console.log('🔑 Chave de criptografia já existe. Nenhuma ação necessária.');
      }
    }
  } catch (error) {
    console.error('❌ Falha ao configurar o arquivo .env:', error);
    process.exit(1); // Encerra o programa se não for possível configurar a segurança
  }
}

// Executa a função de configuração
setupEncryptionKey();

// Carrega as variáveis de ambiente do arquivo .env DEPOIS de garantir que ele existe
require('dotenv').config();


// ==============================================
// 2. RESTANTE DO SERVIDOR
// ==============================================
const express = require('express');
const multer = require('multer');
const db = require('./database');
const WebSocket = require('ws');
const http = require('http');
const { encrypt, decrypt } = require('./crypto-helpers');

const app = express();
const PORT = 3000;

const upload = multer({ dest: 'uploads/temp' });
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

function broadcastUpdate() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'update' }));
    }
  });
}

// Rotas de Notas (com criptografia)
app.get('/api/notes', async (req, res) => {
  try {
    const notes = await db.getAllNotes();
    const decryptedNotes = notes.map(note => ({
      ...note,
      content: note.content ? decrypt(note.content) : '',
    }));
    res.json(decryptedNotes);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/notes', async (req, res) => {
  try {
    const { content } = req.body;
    const contentToStore = content ? encrypt(content) : '';
    const id = await db.createNote({ content: contentToStore });
    broadcastUpdate();
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put('/api/notes/:id', async (req, res) => {
  try {
    const { content } = req.body;
    const contentToStore = content ? encrypt(content) : '';
    await db.updateNote(req.params.id, { content: contentToStore });
    broadcastUpdate();
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    const noteId = req.params.id;
    const attachments = await db.getAttachmentsByNoteId(noteId);
    if (attachments && attachments.length > 0) {
      attachments.forEach(attachment => {
        const filePath = path.join(__dirname, 'uploads', attachment.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
      });
    }
    await db.deleteNote(noteId);
    broadcastUpdate();
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Rotas de Anexos (com criptografia)
app.get('/api/notes/:id/attachments', async (req, res) => {
  try {
    const attachments = await db.getAttachmentsByNoteId(req.params.id);
    res.json(attachments);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/notes/:id/attachments', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).send('Nenhum arquivo enviado');
    }
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    for (const file of req.files) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const tempPath = file.path;
      const encryptedFileName = `${file.filename}.enc`;
      const encryptedPath = path.join(__dirname, 'uploads', encryptedFileName);
      const readStream = fs.createReadStream(tempPath);
      const writeStream = fs.createWriteStream(encryptedPath);
      writeStream.write(iv);
      await new Promise((resolve, reject) => {
          readStream.pipe(cipher).pipe(writeStream)
            .on('finish', () => {
                const authTag = cipher.getAuthTag();
                fs.appendFileSync(encryptedPath, authTag);
                db.addAttachment({
                  note_id: req.params.id,
                  filename: encryptedFileName,
                  originalname: file.originalname
                }).then(resolve).catch(reject);
            })
            .on('error', reject);
      });
      fs.unlinkSync(tempPath);
    }
    broadcastUpdate();
    res.status(201).json({ message: 'Arquivos enviados e criptografados com sucesso.' });
  } catch (err) {
    console.error("Erro no upload:", err);
    res.status(500).send(err.message);
  }
});

app.get('/api/attachments/download/:id', async (req, res) => {
    try {
        const attachment = await db.getAttachmentById(req.params.id);
        if (!attachment) {
            return res.status(404).send('Anexo não encontrado.');
        }
        const encryptedPath = path.join(__dirname, 'uploads', attachment.filename);
        if (!fs.existsSync(encryptedPath)) {
            return res.status(404).send('Arquivo físico não encontrado.');
        }
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        const fileBuffer = fs.readFileSync(encryptedPath);
        const iv = fileBuffer.slice(0, 16);
        const authTag = fileBuffer.slice(-16);
        const encryptedFile = fileBuffer.slice(16, -16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decryptedFile = Buffer.concat([decipher.update(encryptedFile), decipher.final()]);
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalname}"`);
        res.send(decryptedFile);
    } catch (err) {
        console.error("Erro no download:", err);
        res.status(500).send("Falha ao descriptografar o arquivo. Verifique se a chave de criptografia está correta.");
    }
});

app.delete('/api/attachments/:id', async (req, res) => {
  try {
    const attachment = await db.getAttachmentById(req.params.id);
    if (attachment) {
      const filePath = path.join(__dirname, 'uploads', attachment.filename);
      if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
      }
    }
    await db.deleteAttachment(req.params.id);
    broadcastUpdate();
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

wss.on('connection', (ws) => {
  console.log('Cliente conectado via WebSocket');
  ws.on('close', () => console.log('Cliente WebSocket desconectado'));
});