require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Bangkok';

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const publicRoutes = require('./routes/public.routes');
const adminRoutes = require('./routes/admin.routes');
const backupRoutes = require('./routes/backup.routes');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json({ limit: '2mb' }));

// เสิร์ฟ Frontend (Static Files). ปกติอยู่ที่ ../../frontend/public
// ในการรันผ่าน Docker จะ mount โฟลเดอร์นี้แยกต่างหาก จึงปรับ path ได้ผ่าน FRONTEND_DIR
const frontendDir = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(__dirname, '../../frontend/public');
app.use(express.static(frontendDir));

app.use('/api/auth', authRoutes);
app.use('/api/admin/backup', backupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Error handler กลาง — ไม่ส่ง Stack Trace ทางเทคนิคออกไปให้ผู้ใช้เห็น
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ ASM Weekly Mission API พร้อมทำงานที่พอร์ต ${PORT}`);
});
