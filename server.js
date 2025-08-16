import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esto-por-uno-seguro';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// Servir el front desde el mismo proyecto
app.use(express.static(__dirname));

// -------- DB ----------
let db;
async function getUserSafeById(id) {
  return db.get('SELECT id, nombre, email, residencia, nacimiento FROM users WHERE id = ?', id);
}
function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}
function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const [, token] = auth.split(' ');
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'BAD_TOKEN' });
  }
}

// -------- Rutas API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/register', async (req, res) => {
  try {
    const { nombre, email, residencia, nacimiento, password } = req.body || {};
    if (!nombre || !email || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const exists = await db.get('SELECT id FROM users WHERE email = ?', email.toLowerCase());
    if (exists) return res.status(409).json({ error: 'EMAIL_EXISTS' });

    const password_hash = await bcrypt.hash(password, 10);
    const created_at = Date.now();
    const result = await db.run(
      `INSERT INTO users (nombre, email, residencia, nacimiento, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      nombre, email.toLowerCase(), residencia || null, nacimiento || null, password_hash, created_at
    );
    const user = await getUserSafeById(result.lastID);
    const token = makeToken(user);
    return res.json({ token, user });
  } catch (e) {
    console.error('REGISTER_ERROR', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const row = await db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
    if (!row) return res.status(404).json({ error: 'NO_USER' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'BAD_PASSWORD' });

    const user = await getUserSafeById(row.id);
    const token = makeToken(user);
    return res.json({ token, user });
  } catch (e) {
    console.error('LOGIN_ERROR', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/me', authRequired, async (req, res) => {
  try {
    const user = await getUserSafeById(req.user.id);
    if (!user) return res.status(404).json({ error: 'NO_USER' });
    return res.json({ user });
  } catch (e) {
    console.error('ME_ERROR', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Fallback para abrir páginas HTML directas
app.get('*', (req, res, next) => {
  const file = req.path.replace(/^\//, '');
  const allowed = [
    'index.html','login.html','registro.html','panel.html',
    'grupos.html','comparador.html','crea

