const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// A chave é carregada do ambiente, nunca deve estar no código.
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Retorna IV, AuthTag e o texto criptografado, todos em formato hexadecimal.
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedText) {
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    
    if (!ivHex || !authTagHex || !encryptedHex) {
        // Se o formato estiver incorreto, retorna o texto original (pode ser uma nota antiga, não criptografada)
        return encryptedText;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error("Falha ao descriptografar:", error);
    // Retorna um texto indicando falha ou o texto cifrado para análise
    return "[Dados Corrompidos ou Chave Incorreta]";
  }
}

module.exports = { encrypt, decrypt };