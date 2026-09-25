const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logAction } = require('../middleware/audit');

const router = express.Router();

router.post(
  '/login',
  [body('username').trim().notEmpty(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    const { username, password } = req.body;

    try {
      const [rows] = await pool.query(
        'SELECT * FROM admins WHERE username = ? AND active = 1',
        [username]
      );
      const admin = rows[0];
      if (!admin) {
        return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      const ok = await bcrypt.compare(password, admin.password_hash);
      if (!ok) {
        return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      await logAction({ admin, action: 'LOGIN', ip: req.ip });

      res.json({
        token,
        admin: { id: admin.id, username: admin.username, full_name: admin.full_name },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่' });
    }
  }
);

module.exports = router;
