const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'notes.db');
const db = new sqlite3.Database(dbPath);

// Inicialização do banco de dados
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	  updated_at DATETIME
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

// Operações CRUD para notas
exports.getAllNotes = () => {
  return new Promise((resolve, reject) => {
    // CORREÇÃO: Adicionado "ORDER BY created_at DESC" para obter as mais recentes primeiro.
    db.all("SELECT * FROM notes ORDER BY created_at DESC", (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
};

exports.createNote = (note) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO notes (content) VALUES (?)",
      [note.content],
      function(err) {
        err ? reject(err) : resolve(this.lastID);
      }
    );
  });
};

// Atualizar a operação de update para incluir o timestamp
exports.updateNote = (id, note) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [note.content, id],
      (err) => {
        err ? reject(err) : resolve();
      }
    );
  });
};

exports.deleteNote = (id) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM notes WHERE id = ?", [id], (err) => {
      err ? reject(err) : resolve();
    });
  });
};

// Operações para anexos
exports.addAttachment = (attachment) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO attachments (note_id, filename, originalname) VALUES (?, ?, ?)",
      [attachment.note_id, attachment.filename, attachment.originalname],
      (err) => {
        err ? reject(err) : resolve();
      }
    );
  });
};

// Operações para anexos
exports.getAttachmentsByNoteId = (noteId) => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM attachments WHERE note_id = ?", [noteId], (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
};

exports.getAttachmentById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM attachments WHERE id = ?", [id], (err, row) => {
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