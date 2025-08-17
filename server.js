import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import path from 'node:path';

const ADMIN_KEY = process.env.ADMIN_KEY || 'cambia-esta-clave';
const app = express();
const PORT = process.env.PORT || 3000;

// CORS (acepta lista separada por comas)
const corsOriginRaw = process.env.CORS_ORIGIN || '*';
const corsOrigin = corsOriginRaw.includes(',')
  ? corsOriginRaw.split(',').map(s => s.trim())
  : corsOriginRaw;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// --- Rutas/ubicación de la BD ---
// Puedes pasar DB_DIR=/tmp y DB_PATH=bricksy.sqlite3 en Render.
// Si DB_PATH empieza por '/', se usa tal cual.
// Si no, se une a DB_DIR (por defecto TMPDIR o /tmp).
const DB_DIR   = process.env.DB_DIR || process.env.TMPDIR || '/tmp';
const DB_FILE  = process.env.DB_PATH || 'bricksy.sqlite3';
const DB_PATH  = DB_FILE.startsWith('/') ? DB_FILE : path.join(DB_DIR, DB_FILE);

let db;

async function openDbAt(filename) {
  await fs.mkdir(path.dirname(filename), { recursive: true }).catch(() => {});
  return open({ filename, driver: sqlite3.Database });
}

async function initDb() {
  console.log('[DB] Intentando abrir:', DB_PATH);
  try {
    db = await openDbAt(DB_PATH);
  } catch (e1) {
    console.error('[DB] Fallo en DB_PATH:', e1?.message);
    const fallback = '/tmp/bricksy.sqlite3';
    try {
      console.warn('[DB] Reintentando en', fallback);
      db = await openDbAt(fallback);
    } catch (e2) {
      console.error('[DB] Fallo también en /tmp. Usando :memory:', e2?.message);
      db = await open({ filename: ':memory:', driver: sqlite3.Database });
    }
  }

  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      apellidos TEXT,
      residencia TEXT,
      fecha_nacimiento TEXT,
      email TEXT UNIQUE,
      telefono TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('[DB] OK');
}
await initDb();

// Helpers
function normalizeUser(row) {
  if (!row) return null;
  const { password_hash, ...u } = row;
  return u;
}
function signToken(user) {
  const payload = { id: user.id, email: user.email, nombre: user.nombre };
  const secret = process.env.JWT_SECRET || 'dev-secret-change';
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

// Healthcheck
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Registro
app.post('/api/register', async (req, res) => {
  try {
    const b = req.body || {};
    const email = (b.email || '').toLowerCase().trim();
    const password = b.password || '';

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'EMAIL_Y_PASSWORD_REQUERIDOS' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'PASSWORD_DEMASIADO_CORTA' });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'EMAIL_YA_REGISTRADO' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const data = {
      nombre: b.nombre || b.name || '',
      apellidos: b.apellidos || b.surname || b.lastName || '',
      residencia: b.residencia || b.residence || '',
      fecha_nacimiento: b.fecha_nacimiento || b.fechaNacimiento || b.nacimiento || null,
      email,
      telefono: b.telefono || b.phone || null,
      password_hash
    };

    const result = await db.run(
      'INSERT INTO users (nombre, apellidos, residencia, fecha_nacimiento, email, telefono, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.nombre, data.apellidos, data.residencia, data.fecha_nacimiento, data.email, data.telefono, data.password_hash]
    );
    const user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
    const token = signToken(user);

    res.json({ success: true, message: 'REGISTRO_OK', token, user: normalizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'ERROR_SERVIDOR' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const b = req.body || {};
    const email = (b.email || '').toLowerCase().trim();
    const password = b.password || '';

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'CREDENCIALES_INVALIDAS' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'USUARIO_NO_ENCONTRADO' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: 'PASSWORD_INCORRECTA' });
    }

    const token = signToken(user);
    res.json({ success: true, message: 'LOGIN_OK', token, user: normalizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'ERROR_SERVIDOR' });
  }
});

// Middleware JWT
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'TOKEN_REQUERIDO' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change');
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'TOKEN_INVALIDO' });
  }
}

// Perfil
app.get('/api/me', auth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ success: false, error: 'USUARIO_NO_ENCONTRADO' });
  res.json({ success: true, user: normalizeUser(user) });
});

// --- Admin: listar usuarios (requiere cabecera x-admin-key) ---
app.get('/api/admin/users', async (req, res) => {
  try {
    const key = req.header('x-admin-key');
    if (!key || key !== ADMIN_KEY) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Consulta sencilla y compatible (id, name, email)
    const users = await db.all(
      'SELECT id, name, email FROM users ORDER BY id DESC'
    );

    res.json({ users });
  } catch (err) {
    console.error('Error /api/admin/users:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Bricksy backend listening on port ${PORT}`);
});

