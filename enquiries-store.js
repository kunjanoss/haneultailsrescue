const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DEFAULT_KEY_FILE = process.env.ENQUIRIES_KEY_FILE || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'HaneulTailsRescue',
  'enquiries.key'
);
const LEGACY_FILE = 'enquiries.json';
const ENCRYPTED_FILE = 'enquiries.enc';

function paths(dataDir = DEFAULT_DATA_DIR, keyFile = DEFAULT_KEY_FILE) {
  return {
    encrypted: path.join(dataDir, ENCRYPTED_FILE),
    legacy: path.join(dataDir, LEGACY_FILE),
    key: keyFile
  };
}

function loadKey(keyFile, create = false) {
  try {
    const key = fs.readFileSync(keyFile);
    if (key.length !== 32) throw new Error('Invalid local inbox key.');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT' || !create) throw error;
  }

  fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyFile, key, { flag: 'wx', mode: 0o600 });
    return key;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = fs.readFileSync(keyFile);
    if (existing.length !== 32) throw new Error('Invalid local inbox key.');
    return existing;
  }
}

function decryptFile(filename, keyFile) {
  const envelope = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') throw new Error('Unsupported encrypted inbox format.');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error('Invalid encrypted inbox data.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(keyFile), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const entries = JSON.parse(plaintext);
  if (!Array.isArray(entries)) throw new Error('Invalid encrypted inbox data.');
  return entries;
}

function readEnquiries(dataDir = DEFAULT_DATA_DIR, keyFile = DEFAULT_KEY_FILE) {
  const files = paths(dataDir, keyFile);
  if (fs.existsSync(files.encrypted)) return decryptFile(files.encrypted, files.key);
  if (!fs.existsSync(files.legacy)) return [];
  const legacy = JSON.parse(fs.readFileSync(files.legacy, 'utf8'));
  if (!Array.isArray(legacy)) throw new Error('Legacy enquiry file is invalid; refusing to overwrite it.');
  return legacy;
}

function writeEnquiries(entries, dataDir = DEFAULT_DATA_DIR, keyFile = DEFAULT_KEY_FILE) {
  if (!Array.isArray(entries)) throw new TypeError('Enquiries must be an array.');
  const files = paths(dataDir, keyFile);
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const key = loadKey(files.key, true);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf8'), cipher.final()]);
  const envelope = JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }) + '\n';
  const temporary = `${files.encrypted}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, envelope, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, files.encrypted);
  if (fs.existsSync(files.legacy)) {
    const legacy = JSON.parse(fs.readFileSync(files.legacy, 'utf8'));
    if (Array.isArray(legacy) && legacy.length) fs.unlinkSync(files.legacy);
  }
}

function migrateLegacyEnquiries(dataDir = DEFAULT_DATA_DIR, keyFile = DEFAULT_KEY_FILE) {
  const files = paths(dataDir, keyFile);
  if (!fs.existsSync(files.legacy)) return 0;
  const legacy = JSON.parse(fs.readFileSync(files.legacy, 'utf8'));
  if (!Array.isArray(legacy)) throw new Error('Legacy enquiry file is invalid; refusing to overwrite it.');
  if (!legacy.length) return 0;
  const current = fs.existsSync(files.encrypted) ? decryptFile(files.encrypted, files.key) : [];
  const known = new Set(current.map(entry => entry.id).filter(Boolean));
  const combined = [...current, ...legacy.filter(entry => !entry.id || !known.has(entry.id))];
  writeEnquiries(combined, dataDir, keyFile);
  return legacy.length;
}

module.exports = { readEnquiries, writeEnquiries, migrateLegacyEnquiries };
