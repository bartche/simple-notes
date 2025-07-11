const fs = require('fs');
 const path = require('path');
 const crypto = require('crypto');

 function setupEnvironment() {
   const envPath = path.resolve(__dirname, '.env');
   if (!fs.existsSync(envPath)) {
     console.log('Arquivo .env não encontrado. Criando um novo...');
     const newKey = crypto.randomBytes(32).toString('hex');
     const newSessionSecret = crypto.randomBytes(32).toString('hex');
     fs.writeFileSync(envPath, `ENCRYPTION_KEY=${newKey}\nSESSION_SECRET=${newSessionSecret}\n`);
     console.log('✅ Novas chaves geradas e salvas no arquivo .env.');
   } else {
     const content = fs.readFileSync(envPath, 'utf8');
     if (!content.includes('ENCRYPTION_KEY=')) {
       const newKey = crypto.randomBytes(32).toString('hex');
       fs.appendFileSync(envPath, `\nENCRYPTION_KEY=${newKey}\n`);
     }
     if (!content.includes('SESSION_SECRET=')) {
         const newSessionSecret = crypto.randomBytes(32).toString('hex');
         fs.appendFileSync(envPath, `\nSESSION_SECRET=${newSessionSecret}\n`);
     }
   }
 }
 setupEnvironment();

 require('dotenv').config();

 const express = require('express');
 const multer = require('multer');
 const db = require('./database');
 const WebSocket = require('ws');
 const http = require('http');
 const { encrypt, decrypt } = require('./crypto-helpers');
 const bcrypt = require('bcrypt');
 const session = require('express-session');
 const SQLiteStore = require('connect-sqlite3')(session);

 const app = express();
 const PORT = 3000;
 const upload = multer({ dest: 'uploads/temp' });
 const server = http.createServer(app);
 const wss = new WebSocket.Server({ server });

 app.use(express.json());
 app.use(express.static('public'));
 app.use(express.urlencoded({ extended: true }));

 app.use(
   session({
     store: new SQLiteStore({ db: 'sessions.db', dir: './' }),
     secret: process.env.SESSION_SECRET,
     resave: false,
     saveUninitialized: false,
     cookie: {
       maxAge: 7 * 24 * 60 * 60 * 1000,
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       rolling: true,
     },
   })
 );

// Middleware de Autenticação (existente)
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  res.status(401).json({ message: 'Not authorized. Please log in.' });
};

// Middleware para verificar se o usuário é Root (existente)
const isRoot = (req, res, next) => {
  if (req.session.is_root) return next();
  res.status(403).json({ message: 'Access denied. This action is only allowed for administrators.' });
};

// NOVO Middleware para verificar se o usuário é o Super Root (ID = 1)
const isSuperRoot = (req, res, next) => {
    if (req.session.userId === 1) return next();
    res.status(403).json({ message: 'Action allowed only for the super administrator.' });
};

 function broadcastUpdate() {
   wss.clients.forEach(client => {
     if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'update' }));
   });
 }

// ==============================================
// ROTAS DE AUTENTICAÇÃO
// ==============================================
app.post('/api/users/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        const allowRegistrations = await db.getSetting('allow_registrations');
        const userCount = await db.getUserCount();

        // Permite o registro se estiver habilitado OU se for o primeiro usuário
        if (allowRegistrations !== 'true' && userCount > 0) {
            return res.status(403).json({ message: 'New account registration is disabled by the administrator' });
        }
        
        const existingUser = await db.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ message: 'Username already in use' });
        }
        
        // Define como root se for o primeiro usuário (contagem é zero)
        const isRoot = userCount === 0;

        const passwordHash = await bcrypt.hash(password, 10);
        await db.createUser(username, passwordHash, isRoot);

        // Mensagem de sucesso personalizada para o admin
        let successMessage = isRoot 
            ? 'Administrator (root) account created successfully!' 
            : 'Normal user created successfully.';

        res.status(201).json({ message: successMessage });
    } catch (err) {
        console.error("Erro no registro:", err);
        res.status(500).json({ message: 'There was an error on the server.' });
    }
});

 app.post('/api/users/login', async (req, res) => {
     const { username, password } = req.body;
     try {
         const user = await db.findUserByUsername(username);
         if (!user) return res.status(401).json({ message: 'Username or password incorrect' });
         const match = await bcrypt.compare(password, user.password_hash);
         if (match) {
             req.session.userId = user.id;
             req.session.username = user.username;
			 req.session.is_root = user.is_root;
			 req.session.theme = user.theme;
             res.json({ message: 'Login successfully' });
         } else { res.status(401).json({ message: 'Username or password incorrect' }); }
     } catch (err) { res.status(500).json({ message: 'There was an error on the server.' }); }
 });

 app.post('/api/users/logout', (req, res) => {
     req.session.destroy(err => {
         if (err) return res.status(500).json({ message: 'Unable to logout.' });
         res.clearCookie('connect.sid');
         res.json({ message: 'Logout successfully' });
     });
 });

app.get('/api/users/status', async (req, res) => { // A função agora é async
    if (req.session.userId) {
        // Busca o usuário para obter o tema mais recente
        const user = await db.findUserById(req.session.userId);
        if (user) {
            res.json({ 
                loggedIn: true, 
                username: user.username,
                is_root: !!user.is_root,
                userId: user.id,
                theme: user.theme // <-- ADICIONADO: Envia o tema salvo no DB
            });
        } else {
             res.json({ loggedIn: false });
        }
    } else {
        res.json({ loggedIn: false });
    }
});
 
 // ==============================================
// NOVAS ROTAS DE ADMINISTRAÇÃO (PROTEGIDAS)
// ==============================================
app.get('/api/users', isAuthenticated, isRoot, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Error when searching for users.' });
    }
});

app.post('/api/users/:id/promote', isAuthenticated, isSuperRoot, async (req, res) => {
    const userIdToChange = Number(req.params.id);
    // Impede que o super root mude o próprio status
    if (userIdToChange === 1) {
        return res.status(403).json({ message: 'The super administrator cannot be changed.' });
    }
    try {
        await db.setUserRootStatus(userIdToChange, req.body.is_root);
        res.json({ message: 'User status updated.' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating user status.' });
    }
});

app.delete('/api/users/:id', isAuthenticated, isSuperRoot, async (req, res) => {
    const userIdToDelete = Number(req.params.id);
    
    // Impede que o super root se apague
    if (userIdToDelete === 1) {
        return res.status(403).json({ message: 'The super administrator cannot be deleted.' });
    }

    try {
        // Antes de apagar o usuário, precisamos apagar seus arquivos físicos
        const notes = await db.getAllNotes(userIdToDelete);
        for (const note of notes) {
            const attachments = await db.getAttachmentsByNoteId(note.id);
            if (attachments && attachments.length > 0) {
                attachments.forEach(attachment => {
                    const filePath = path.join(__dirname, 'uploads', attachment.filename);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                });
            }
        }
        
        // Agora apaga o usuário (e suas notas/anexos no DB via cascade)
        await db.deleteUser(userIdToDelete);
        res.json({ message: `User ${userIdToDelete} and all its data has been deleted.` });
    } catch (err) {
        console.error("Error deleting user:", err);
        res.status(500).json({ message: 'Server error when trying to delete user.' });
    }
});

// Rota para salvar a preferência de tema do usuário
app.post('/api/users/theme', isAuthenticated, async (req, res) => {
    const { theme } = req.body;
    const userId = req.session.userId;

    if (!theme || (theme !== 'light' && theme !== 'dark')) {
        return res.status(400).json({ message: 'Invalid theme.' });
    }

    try {
        await db.updateUserTheme(userId, theme);
        res.json({ message: 'Theme updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error saving theme.' });
    }
});

app.get('/api/settings/registrations', isAuthenticated, isRoot, async (req, res) => {
    try {
        const status = await db.getSetting('allow_registrations');
        res.json({ enabled: status === 'true' });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching configuration.' });
    }
});

app.post('/api/settings/registrations', isAuthenticated, isRoot, async (req, res) => {
    try {
        await db.updateSetting('allow_registrations', req.body.enabled.toString());
        res.json({ message: 'Updated configuration.' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating configuration.' });
    }
});
 
 app.post('/api/users/change-password', isAuthenticated, async (req, res) => {
     const { currentPassword, newPassword } = req.body;
     const userId = req.session.userId;
     if (!currentPassword || !newPassword) return res.status(400).json({ message: 'All fields are required..' });
     try {
         const user = await db.findUserById(userId);
         if (!user) return res.status(404).json({ message: 'User not found.' });
         const match = await bcrypt.compare(currentPassword, user.password_hash);
         if (!match) return res.status(403).json({ message: 'Current password is incorrect.' });
         const newPasswordHash = await bcrypt.hash(newPassword, 10);
         await db.updateUserPassword(userId, newPasswordHash);
         res.json({ message: 'Password updated successfully!' });
     } catch (error) { res.status(500).json({ message: 'Server error while trying to change password.' });}
 });

app.get('/api/notes', isAuthenticated, async (req, res) => {
  try {
    const notes = await db.getAllNotes(req.session.userId);
    const decryptedNotes = notes.map(note => ({
      ...note,
      content: note.content ? decrypt(note.content) : '',
    }));
    res.json(decryptedNotes);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
 
app.post('/api/notes', isAuthenticated, async (req, res) => {
  try {
    const { content } = req.body;
    const contentToStore = content ? encrypt(content) : '';
    const status = content ? 'published' : 'draft';
    const id = await db.createNote({ userId: req.session.userId, content: contentToStore, status: status });
    broadcastUpdate();
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
 
app.put('/api/notes/:id', isAuthenticated, async (req, res) => {
  try {
    const { content } = req.body;
    const contentToStore = content ? encrypt(content) : '';
    await db.updateNote(req.params.id, req.session.userId, { content: contentToStore, status: 'published' });
    broadcastUpdate();
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
 
 app.delete('/api/notes/:id', isAuthenticated, async (req, res) => {
   try {
     const noteId = req.params.id;
     const attachments = await db.getAttachmentsByNoteId(noteId);
     if (attachments && attachments.length > 0) {
       attachments.forEach(attachment => {
         const filePath = path.join(__dirname, 'uploads', attachment.filename);
         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
       });
     }
     await db.deleteNote(noteId, req.session.userId);
     broadcastUpdate();
     res.sendStatus(200);
   } catch (err) { res.status(500).send(err.message); }
 });
 
 app.get('/api/notes/:id/attachments', isAuthenticated, async (req, res) => {
   try {
     const attachments = await db.getAttachmentsByNoteId(req.params.id);
     res.json(attachments);
   } catch (err) { res.status(500).send(err.message); }
 });
 
app.post('/api/notes/:id/attachments', isAuthenticated, upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).send('Nenhum arquivo enviado');
    }

    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const createdAttachments = [];

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
            .on('finish', async () => {
                try {
                    const authTag = cipher.getAuthTag();
                    fs.appendFileSync(encryptedPath, authTag);
                    
                    const newAttachmentId = await db.addAttachment({
                      note_id: req.params.id,
                      filename: encryptedFileName,
                      originalname: file.originalname
                    });

                    // Adiciona o anexo recém-criado à lista para retornar
                    createdAttachments.push({ id: newAttachmentId, originalname: file.originalname });
                    
                    resolve();
                } catch (dbError) {
                    reject(dbError);
                }
            })
            .on('error', reject);
      });
      
      fs.unlinkSync(tempPath);
    }
    
    broadcastUpdate();
    // CORREÇÃO: Retorna um JSON com os anexos criados
    res.status(201).json({ 
        message: 'Files successfully uploaded and encrypted.',
        attachments: createdAttachments
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send(err.message);
  }
});
 
 app.get('/api/attachments/download/:id', isAuthenticated, async (req, res) => {
     try {
         const attachment = await db.getAttachmentById(req.params.id);
         if (!attachment || attachment.user_id !== req.session.userId) return res.status(403).send('Acesso negado.');
         const encryptedPath = path.join(__dirname, 'uploads', attachment.filename);
         if (!fs.existsSync(encryptedPath)) return res.status(404).send('Arquivo físico não encontrado.');
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
     } catch (err) { res.status(500).send("Falha ao descriptografar o arquivo."); }
 });
 
 app.delete('/api/attachments/:id', isAuthenticated, async (req, res) => {
   try {
     const attachment = await db.getAttachmentById(req.params.id);
     if (attachment && attachment.user_id === req.session.userId) {
       const filePath = path.join(__dirname, 'uploads', attachment.filename);
       if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
       await db.deleteAttachment(req.params.id);
       broadcastUpdate();
       res.sendStatus(200);
     } else { res.status(403).send('Access denied.'); }
   } catch (err) { res.status(500).send(err.message); }
 });

 app.get('/', isAuthenticated, (req, res) => {
     res.sendFile(path.join(__dirname, 'public', 'index.html'));
 });

 server.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));

 wss.on('connection', (ws) => {
   console.log('Cliente conectado via WebSocket');
   ws.on('close', () => console.log('Cliente WebSocket desconectado'));
 });