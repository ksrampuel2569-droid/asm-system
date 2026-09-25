const pool = require('../config/db');

// บันทึก Audit Log ทุกครั้งที่เจ้าหน้าที่แก้ไขข้อมูลสำคัญ (ตาม requirement ข้อ 34, 70)
async function logAction({ admin, action, table_name = null, record_id = null, old_value = null, new_value = null, ip = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (admin_id, admin_username, action, table_name, record_id, old_value, new_value, ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        admin?.id || null,
        admin?.username || null,
        action,
        table_name,
        record_id,
        old_value ? JSON.stringify(old_value) : null,
        new_value ? JSON.stringify(new_value) : null,
        ip,
      ]
    );
  } catch (err) {
    // ไม่ควรทำให้ request หลักล้มเหลวเพียงเพราะบันทึก log ไม่สำเร็จ แต่ต้อง log ไว้ให้ dev เห็น
    console.error('[audit_log_error]', err.message);
  }
}

module.exports = { logAction };
