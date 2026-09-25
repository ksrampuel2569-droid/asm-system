const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');

const router = express.Router();
router.use(requireAdmin);

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const upload = multer({ dest: path.join(BACKUP_DIR, 'uploads') });

// ---------------------------------------------------------
// POST /api/admin/backup — สั่งสำรองข้อมูลทันที (ใช้ mysqldump ของ Server)
// ต้องติดตั้ง mysql-client (คำสั่ง mysqldump) บน Server ที่รัน Backend
// ---------------------------------------------------------
router.post('/', async (req, res) => {
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  const args = [
    `-h${process.env.DB_HOST}`, `-P${process.env.DB_PORT || 3306}`,
    `-u${process.env.DB_USER}`, `--default-character-set=utf8mb4`,
    '--single-transaction', '--routines', '--triggers', process.env.DB_NAME,
  ];
  const env = { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD };

  const dump = spawn('mysqldump', args, { env });
  const outStream = fs.createWriteStream(filepath);
  dump.stdout.pipe(outStream);

  let stderrOutput = '';
  dump.stderr.on('data', d => (stderrOutput += d.toString()));

  dump.on('close', async code => {
    if (code !== 0) {
      console.error('[mysqldump_error]', stderrOutput);
      return res.status(500).json({ error: 'สำรองข้อมูลไม่สำเร็จ กรุณาตรวจสอบว่าติดตั้ง mysqldump บน Server แล้ว' });
    }
    await logAction({ admin: req.admin, action: 'BACKUP_DATABASE', new_value: { filename }, ip: req.ip });
    res.json({ ok: true, filename, size_bytes: fs.statSync(filepath).size });
  });

  dump.on('error', err => {
    console.error(err);
    res.status(500).json({ error: 'ไม่พบคำสั่ง mysqldump บน Server นี้' });
  });
});

// ---------------------------------------------------------
// GET /api/admin/backup — รายการไฟล์ Backup ที่มีอยู่
// ---------------------------------------------------------
router.get('/', (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size_bytes: stat.size, created_at: stat.birthtime };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(files);
});

// ---------------------------------------------------------
// GET /api/admin/backup/:filename/download — ดาวน์โหลดไฟล์ Backup
// ---------------------------------------------------------
router.get('/:filename/download', (req, res) => {
  const safeName = path.basename(req.params.filename); // ป้องกัน path traversal
  const filepath = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'ไม่พบไฟล์ Backup นี้' });
  res.download(filepath);
});

// ---------------------------------------------------------
// POST /api/admin/backup/restore — กู้คืนข้อมูลจากไฟล์ .sql ที่อัปโหลด
// คำเตือน: การ Restore จะเขียนทับข้อมูลปัจจุบัน ควร Backup ก่อนเสมอ
// ---------------------------------------------------------
router.post('/restore', upload.single('backup_file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์ Backup (.sql)' });

  const args = [`-h${process.env.DB_HOST}`, `-P${process.env.DB_PORT || 3306}`, `-u${process.env.DB_USER}`, `--default-character-set=utf8mb4`, process.env.DB_NAME];
  const env = { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD };
  const restoreProc = spawn('mysql', args, { env });
  const inStream = fs.createReadStream(req.file.path);
  inStream.pipe(restoreProc.stdin);

  let stderrOutput = '';
  restoreProc.stderr.on('data', d => (stderrOutput += d.toString()));

  restoreProc.on('close', async code => {
    fs.unlink(req.file.path, () => {});
    if (code !== 0) {
      console.error('[restore_error]', stderrOutput);
      return res.status(500).json({ error: 'กู้คืนข้อมูลไม่สำเร็จ กรุณาตรวจสอบไฟล์ Backup' });
    }
    await logAction({ admin: req.admin, action: 'RESTORE_DATABASE', ip: req.ip });
    res.json({ ok: true });
  });
});

module.exports = router;
