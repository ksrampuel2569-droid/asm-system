const jwt = require('jsonwebtoken');

// ตรวจสอบ JWT Token จาก Header: Authorization: Bearer <token>
// ห้ามเชื่อข้อมูลจาก Frontend โดยไม่ตรวจสอบสิทธิ์ฝั่ง Server ทุกครั้ง (ตาม requirement ข้อ 35, 68)
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

module.exports = { requireAdmin };
