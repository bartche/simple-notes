const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'notes.db');
const db = new sqlite3.Database(dbPath);

// Inicialização do banco de dados
db.serialize(() => {
  // Tabela de Usuários com coluna de privilégio
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_root BOOLEAN NOT NULL DEFAULT 0,
	  theme TEXT NOT NULL DEFAULT 'dark'
    )
  `);

  // Tabela de Configurações Globais
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Insere a configuração padrão se não existir
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_registrations', 'true')");
  
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
	  status TEXT NOT NULL DEFAULT 'draft',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `);
});

// ==============================================
// FUNÇÕES DE CONFIGURAÇÕES
// ==============================================
exports.getSetting = (key) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT value FROM settings WHERE key = ?", [key], (err, row) => {
            err ? reject(err) : resolve(row ? row.value : null);
        });
    });
};

exports.updateSetting = (key, value) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE settings SET value = ? WHERE key = ?", [value, key], function(err) {
            err ? reject(err) : resolve(this.changes);
        });
    });
};

// ==============================================
// FUNÇÕES DE USUÁRIO
// ==============================================

// NOVA FUNÇÃO para contar usuários
exports.getUserCount = () => {
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
            err ? reject(err) : resolve(row.count);
        });
    });
};

exports.findUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
      err ? reject(err) : resolve(row);
    });
  });
};

exports.findUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      err ? reject(err) : resolve(row);
    });
  });
};

exports.updateUserTheme = (userId, theme) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET theme = ? WHERE id = ?", [theme, userId], function(err) {
      err ? reject(err) : resolve(this.changes);
    });
  });
};

// FUNÇÃO MODIFICADA para aceitar o status de root
exports.createUser = (username, passwordHash, isRoot = false) => {
  return new Promise((resolve, reject) => {
    const isRootValue = isRoot ? 1 : 0;
    db.run("INSERT INTO users (username, password_hash, is_root) VALUES (?, ?, ?)", [username, passwordHash, isRootValue], function(err) {
      err ? reject(err) : resolve(this.lastID);
    });
  });
};

exports.updateUserPassword = (userId, newPasswordHash) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newPasswordHash, userId], function(err) {
      err ? reject(err) : resolve(this.changes);
    });
  });
};

exports.getAllUsers = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, username, is_root FROM users", (err, rows) => {
            err ? reject(err) : resolve(rows);
        });
    });
};

exports.deleteUser = (id) => {
  return new Promise((resolve, reject) => {
    // A configuração ON DELETE CASCADE cuidará de apagar as notas e anexos associados
    db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
      err ? reject(err) : resolve(this.changes);
    });
  });
};

exports.setUserRootStatus = (userId, isRoot) => {
    const isRootValue = isRoot ? 1 : 0;
    return new Promise((resolve, reject) => {
        db.run("UPDATE users SET is_root = ? WHERE id = ?", [isRootValue, userId], function(err) {
            err ? reject(err) : resolve(this.changes);
        });
    });
};

// ==============================================
// FUNÇÕES DE NOTAS E ANEXOS (sem alterações)
// ==============================================
exports.getAllNotes = (userId) => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM notes WHERE user_id = ? AND status = 'published' ORDER BY created_at DESC", [userId], (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
};

exports.createNote = (note) => {
  return new Promise((resolve, reject) => {
    // Novas notas com texto são publicadas, rascunhos de anexo começam como draft
    const status = note.status || 'draft'; 
    db.run(
      "INSERT INTO notes (user_id, content, status) VALUES (?, ?, ?)",
      [note.userId, note.content, status],
      function(err) {
        err ? reject(err) : resolve(this.lastID);
      }
    );
  });
};

exports.updateNote = (id, userId, note) => {
  return new Promise((resolve, reject) => {
    const statusToSet = note.status || 'published';
    db.run(
      "UPDATE notes SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      [note.content, statusToSet, id, userId],
      function(err) {
        err ? reject(err) : resolve(this.changes);
      }
    );
  });
};

exports.deleteNote = (id, userId) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, userId], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
  });
};

exports.getAttachmentsByNoteId = (noteId) => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM attachments WHERE note_id = ?", [noteId], (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
};

exports.getAttachmentById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT a.*, n.user_id FROM attachments a JOIN notes n ON a.note_id = n.id WHERE a.id = ?", [id], (err, row) => {
      err ? reject(err) : resolve(row);
    });
  });
};

exports.addAttachment = (attachment) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO attachments (note_id, filename, originalname) VALUES (?, ?, ?)",
      [attachment.note_id, attachment.filename, attachment.originalname],
      function(err) {
        err ? reject(err) : resolve(this.lastID);
      }
    );
  });
};

exports.deleteAttachment = (id) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM attachments WHERE id = ?", [id], (err) => {
      err ? reject(err) : resolve();
    });
  });
};