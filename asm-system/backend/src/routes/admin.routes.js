const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');
const { daysSinceBite, computeStar, isoWeekNumber } = require('../utils/helpers');

const router = express.Router();
router.use(requireAdmin); // ทุก endpoint ในไฟล์นี้ต้อง Login ก่อน (ห้ามเปิด Dashboard สาธารณะ)

// ============================================================
// DASHBOARD ภาพรวม
// ============================================================
router.get('/dashboard', async (req, res) => {
  const missionId = req.query.mission_id;
  let mission;
  if (missionId) {
    const [[m]] = await pool.query('SELECT * FROM weekly_missions WHERE id = ?', [missionId]);
    mission = m;
  } else {
    const [[m]] = await pool.query('SELECT * FROM weekly_missions ORDER BY start_datetime DESC LIMIT 1');
    mission = m;
  }
  if (!mission) return res.json({ mission: null, stats: null, grid: [], bites: [] });

  const [volunteers] = await pool.query(
    `SELECT v.id, v.full_name, vg.village_name, vg.village_number
     FROM volunteers v JOIN villages vg ON vg.id = v.village_id
     WHERE v.active = 1 ORDER BY CAST(vg.village_number AS UNSIGNED), v.full_name`
  );

  const [surveys] = await pool.query(
    `SELECT * FROM surveys WHERE mission_id = ?`, [mission.id]
  );
  const surveyByVolunteer = Object.fromEntries(surveys.map(s => [s.volunteer_id, s]));

  const grid = volunteers.map(v => {
    const s = surveyByVolunteer[v.id] || null;
    return {
      volunteer_id: v.id,
      full_name: v.full_name,
      village_name: v.village_name,
      village_number: v.village_number,
      survey_id: s?.id || null,
      star: computeStar(s),
    };
  });

  const [[biteAgg]] = await pool.query(
    `SELECT COUNT(*) AS bite_people FROM bite_exposures be
     JOIN surveys s ON s.id = be.survey_id WHERE s.mission_id = ?`,
    [mission.id]
  );

  const [bites] = await pool.query(
    `SELECT be.*, s.village_id, vg.village_name, v.full_name AS reporter_name, s.submitted_at
     FROM bite_exposures be
     JOIN surveys s ON s.id = be.survey_id
     JOIN villages vg ON vg.id = s.village_id
     JOIN volunteers v ON v.id = s.volunteer_id
     WHERE s.mission_id = ? ORDER BY be.bite_date DESC`,
    [mission.id]
  );
  const bitesOut = bites.map(b => ({ ...b, days_since_bite: daysSinceBite(b.bite_date) }));

  res.json({
    mission,
    stats: {
      total_volunteers: volunteers.length,
      submitted: surveys.length,
      not_submitted: volunteers.length - surveys.length,
      bite_found_reports: surveys.filter(s => s.survey_result === 'BITE_FOUND').length,
      bite_people: biteAgg.bite_people,
    },
    grid,
    bites: bitesOut,
  });
});

// ============================================================
// MISSIONS
// ============================================================
router.get('/missions', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM weekly_missions ORDER BY start_datetime DESC');
  res.json(rows);
});

router.post(
  '/missions',
  [
    body('year').isInt(), body('week_number').isInt(),
    body('start_datetime').isISO8601(), body('deadline_datetime').isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'กรุณากรอกข้อมูลภารกิจให้ครบถ้วน' });

    const { year, week_number, title, start_datetime, deadline_datetime, late_until_datetime, allow_edit_after_deadline } = req.body;
    const token = crypto.randomBytes(16).toString('hex');
    try {
      const [result] = await pool.query(
        `INSERT INTO weekly_missions
           (mission_token, year, week_number, title, start_datetime, deadline_datetime, late_until_datetime, allow_edit_after_deadline, status)
         VALUES (?,?,?,?,?,?,?,?,'OPEN')`,
        [token, year, week_number, title || `ภารกิจเฝ้าระวังสัปดาห์ที่ ${week_number} ปี ${year}`,
         start_datetime, deadline_datetime, late_until_datetime || null, !!allow_edit_after_deadline]
      );
      await logAction({ admin: req.admin, action: 'CREATE_MISSION', table_name: 'weekly_missions', record_id: result.insertId, new_value: req.body, ip: req.ip });
      res.status(201).json({ id: result.insertId, mission_token: token });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'มีภารกิจของสัปดาห์/ปีนี้อยู่แล้ว' });
      console.error(err);
      res.status(500).json({ error: 'ไม่สามารถสร้างภารกิจได้' });
    }
  }
);

router.put('/missions/:id/status', body('status').isIn(['OPEN', 'CLOSED']), async (req, res) => {
  const [[before]] = await pool.query('SELECT * FROM weekly_missions WHERE id = ?', [req.params.id]);
  if (!before) return res.status(404).json({ error: 'ไม่พบภารกิจ' });
  await pool.query('UPDATE weekly_missions SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
  await logAction({ admin: req.admin, action: 'UPDATE_MISSION_STATUS', table_name: 'weekly_missions', record_id: req.params.id, old_value: before, new_value: { status: req.body.status }, ip: req.ip });
  res.json({ ok: true });
});

// ============================================================
// VILLAGES CRUD
// ============================================================
router.get('/villages', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM villages ORDER BY CAST(village_number AS UNSIGNED)');
  res.json(rows);
});

router.put('/villages/:id', body('village_name').notEmpty(), async (req, res) => {
  const [[before]] = await pool.query('SELECT * FROM villages WHERE id = ?', [req.params.id]);
  if (!before) return res.status(404).json({ error: 'ไม่พบหมู่บ้าน' });
  const { village_name, active } = req.body;
  await pool.query('UPDATE villages SET village_name = ?, active = ? WHERE id = ?', [village_name, active ?? before.active, req.params.id]);
  await logAction({ admin: req.admin, action: 'UPDATE_VILLAGE', table_name: 'villages', record_id: req.params.id, old_value: before, new_value: req.body, ip: req.ip });
  res.json({ ok: true });
});

// ============================================================
// VOLUNTEERS CRUD
// ============================================================
router.get('/volunteers', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT v.*, vg.village_name FROM volunteers v JOIN villages vg ON vg.id = v.village_id
     ORDER BY CAST(vg.village_number AS UNSIGNED), v.full_name`
  );
  res.json(rows);
});

router.post('/volunteers', [body('full_name').notEmpty(), body('village_id').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'กรุณากรอกชื่อและหมู่บ้าน' });
  const { full_name, sex, village_id } = req.body;
  const [result] = await pool.query('INSERT INTO volunteers (full_name, sex, village_id) VALUES (?,?,?)', [full_name, sex || null, village_id]);
  await logAction({ admin: req.admin, action: 'CREATE_VOLUNTEER', table_name: 'volunteers', record_id: result.insertId, new_value: req.body, ip: req.ip });
  res.status(201).json({ id: result.insertId });
});

router.put('/volunteers/:id', async (req, res) => {
  const [[before]] = await pool.query('SELECT * FROM volunteers WHERE id = ?', [req.params.id]);
  if (!before) return res.status(404).json({ error: 'ไม่พบ อสม.' });
  const { full_name, sex, village_id, active } = req.body;
  await pool.query(
    'UPDATE volunteers SET full_name=?, sex=?, village_id=?, active=? WHERE id=?',
    [full_name ?? before.full_name, sex ?? before.sex, village_id ?? before.village_id, active ?? before.active, req.params.id]
  );
  await logAction({ admin: req.admin, action: 'UPDATE_VOLUNTEER', table_name: 'volunteers', record_id: req.params.id, old_value: before, new_value: req.body, ip: req.ip });
  res.json({ ok: true });
});

// ============================================================
// STATISTICS
// ============================================================
router.get('/statistics', async (req, res) => {
  const { village_id } = req.query;
  const params = [];
  let villageFilter = '';
  if (village_id) { villageFilter = 'AND s.village_id = ?'; params.push(village_id); }

  const [weekly] = await pool.query(
    `SELECT m.year, m.week_number, COUNT(DISTINCT be.id) AS bite_people
     FROM weekly_missions m
     LEFT JOIN surveys s ON s.mission_id = m.id ${villageFilter}
     LEFT JOIN bite_exposures be ON be.survey_id = s.id
     GROUP BY m.id ORDER BY m.year, m.week_number`,
    params
  );

  const [byAnimal] = await pool.query(
    `SELECT be.animal_type, COUNT(*) AS count FROM bite_exposures be
     JOIN surveys s ON s.id = be.survey_id WHERE 1=1 ${villageFilter}
     GROUP BY be.animal_type`,
    params
  );

  const [byVillage] = await pool.query(
    `SELECT vg.village_name, COUNT(DISTINCT v.id) AS total_volunteers,
            COUNT(DISTINCT s.id) AS total_reports,
            COUNT(be.id) AS bite_people
     FROM villages vg
     LEFT JOIN volunteers v ON v.village_id = vg.id AND v.active = 1
     LEFT JOIN surveys s ON s.village_id = vg.id
     LEFT JOIN bite_exposures be ON be.survey_id = s.id
     GROUP BY vg.id ORDER BY CAST(vg.village_number AS UNSIGNED)`
  );

  res.json({ weekly, byAnimal, byVillage });
});

// ============================================================
// EXCEL EXPORT (.xlsx) — utf8mb4 ปลอดภัย เปิดด้วย Excel ได้ปกติ
// ============================================================
router.get('/export/excel', async (req, res) => {
  const { mission_id, village_id, date_from, date_to } = req.query;

  const filters = [];
  const params = [];
  if (mission_id) { filters.push('s.mission_id = ?'); params.push(mission_id); }
  if (village_id) { filters.push('s.village_id = ?'); params.push(village_id); }
  if (date_from) { filters.push('DATE(s.submitted_at) >= ?'); params.push(date_from); }
  if (date_to) { filters.push('DATE(s.submitted_at) <= ?'); params.push(date_to); }
  const whereClause = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [surveys] = await pool.query(
    `SELECT s.*, v.full_name AS volunteer_name, vg.village_name, m.week_number, m.year
     FROM surveys s
     JOIN volunteers v ON v.id = s.volunteer_id
     JOIN villages vg ON vg.id = s.village_id
     JOIN weekly_missions m ON m.id = s.mission_id
     ${whereClause} ORDER BY s.submitted_at DESC`,
    params
  );
  const surveyIds = surveys.map(s => s.id);
  let exposures = [];
  if (surveyIds.length) {
    const [rows] = await pool.query(
      `SELECT be.*, c.advised_doctor_24_48h, c.advised_wound_washing, c.advised_animal_observation, c.provided_rabies_education
       FROM bite_exposures be LEFT JOIN counseling c ON c.exposure_id = be.id
       WHERE be.survey_id IN (?)`,
      [surveyIds]
    );
    exposures = rows;
  }
  const exposuresBySurvey = {};
  exposures.forEach(e => { (exposuresBySurvey[e.survey_id] ||= []).push(e); });

  const animalLabel = { dog: 'สุนัข', cat: 'แมว', cow: 'โค', squirrel: 'กระรอก', other: 'สัตว์อื่นๆ' };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบภารกิจ อสม. ประจำสัปดาห์';

  // Sheet 1: รายงานทั้งหมด
  const s1 = wb.addWorksheet('รายงานทั้งหมด');
  s1.columns = [
    { header: 'สัปดาห์', key: 'week', width: 10 },
    { header: 'ปี', key: 'year', width: 8 },
    { header: 'อสม.', key: 'volunteer', width: 26 },
    { header: 'หมู่บ้าน', key: 'village', width: 22 },
    { header: 'ผลการสำรวจ', key: 'result', width: 16 },
    { header: 'ชื่อผู้ถูกกัด', key: 'pname', width: 26 },
    { header: 'เพศ', key: 'psex', width: 8 },
    { header: 'อายุ', key: 'page', width: 8 },
    { header: 'บ้านเลขที่', key: 'phouse', width: 12 },
    { header: 'สัตว์', key: 'animal', width: 12 },
    { header: 'บริเวณที่ถูกกัด', key: 'loc', width: 16 },
    { header: 'สถานะวัคซีน', key: 'vac', width: 16 },
    { header: 'วันที่ถูกกัด', key: 'bdate', width: 14 },
    { header: 'วันที่รายงาน', key: 'sdate', width: 14 },
    { header: 'จำนวนวัน', key: 'days', width: 10 },
    { header: 'แนะนำพบแพทย์ 24-48ชม', key: 'c1', width: 20 },
    { header: 'แนะนำล้างแผล', key: 'c2', width: 16 },
    { header: 'แนะนำสังเกตสัตว์', key: 'c3', width: 16 },
    { header: 'ให้ความรู้พิษสุนัขบ้า', key: 'c4', width: 18 },
    { header: 'สถานะส่งรายงาน', key: 'status', width: 16 },
  ];
  s1.getRow(1).font = { bold: true };

  surveys.forEach(s => {
    const list = exposuresBySurvey[s.id] || [];
    if (s.survey_result === 'NO_BITE' || list.length === 0) {
      s1.addRow({
        week: s.week_number, year: s.year, volunteer: s.volunteer_name, village: s.village_name,
        result: 'ไม่พบผู้ถูกกัด', sdate: s.submitted_at, status: s.submission_status === 'LATE' ? 'ล่าช้า' : 'ตรงเวลา',
      });
    } else {
      list.forEach(p => {
        s1.addRow({
          week: s.week_number, year: s.year, volunteer: s.volunteer_name, village: s.village_name,
          result: 'พบผู้ถูกกัด', pname: p.full_name, psex: p.sex, page: p.age, phouse: p.house_number,
          animal: animalLabel[p.animal_type] || p.animal_other || p.animal_type, loc: p.bite_location,
          vac: p.vaccination_status === 'vaccinated' ? 'ได้รับ' : p.vaccination_status === 'not_vaccinated' ? 'ไม่ได้รับ' : 'ไม่ทราบ',
          bdate: p.bite_date, sdate: s.submitted_at, days: daysSinceBite(p.bite_date),
          c1: p.advised_doctor_24_48h ? 'ใช่' : 'ไม่ใช่', c2: p.advised_wound_washing ? 'ใช่' : 'ไม่ใช่',
          c3: p.advised_animal_observation ? 'ใช่' : 'ไม่ใช่', c4: p.provided_rabies_education ? 'ใช่' : 'ไม่ใช่',
          status: s.submission_status === 'LATE' ? 'ล่าช้า' : 'ตรงเวลา',
        });
      });
    }
  });

  // Sheet 2: สรุปรายสัปดาห์
  const s2 = wb.addWorksheet('สรุปรายสัปดาห์');
  s2.columns = [
    { header: 'สัปดาห์', key: 'week', width: 10 }, { header: 'ปี', key: 'year', width: 8 },
    { header: 'รายงานทั้งหมด', key: 'total', width: 14 }, { header: 'ไม่พบผู้ถูกกัด', key: 'no', width: 14 },
    { header: 'พบผู้ถูกกัด', key: 'yes', width: 14 }, { header: 'จำนวนผู้ถูกกัด', key: 'people', width: 14 },
    { header: 'รายงานล่าช้า', key: 'late', width: 14 },
  ];
  s2.getRow(1).font = { bold: true };
  const byMission = {};
  surveys.forEach(s => {
    const key = `${s.year}-${s.week_number}`;
    byMission[key] ||= { year: s.year, week: s.week_number, total: 0, no: 0, yes: 0, people: 0, late: 0 };
    byMission[key].total++;
    if (s.survey_result === 'NO_BITE') byMission[key].no++; else byMission[key].yes++;
    byMission[key].people += (exposuresBySurvey[s.id] || []).length;
    if (s.submission_status === 'LATE') byMission[key].late++;
  });
  Object.values(byMission).forEach(r => s2.addRow(r));

  // Sheet 3: รายชื่อ อสม.
  const s3 = wb.addWorksheet('รายชื่อ อสม.');
  s3.columns = [
    { header: 'ชื่อ-สกุล', key: 'name', width: 28 }, { header: 'เพศ', key: 'sex', width: 8 },
    { header: 'หมู่บ้าน', key: 'village', width: 24 }, { header: 'สถานะ', key: 'active', width: 12 },
  ];
  s3.getRow(1).font = { bold: true };
  const [allVol] = await pool.query(
    `SELECT v.full_name, v.sex, v.active, vg.village_name FROM volunteers v
     JOIN villages vg ON vg.id = v.village_id ORDER BY CAST(vg.village_number AS UNSIGNED), v.full_name`
  );
  allVol.forEach(v => s3.addRow({ name: v.full_name, sex: v.sex, village: v.village_name, active: v.active ? 'ใช้งาน' : 'ปิดใช้งาน' }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="asm-report-${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();

  await logAction({ admin: req.admin, action: 'EXPORT_EXCEL', ip: req.ip });
});

// ============================================================
// AUDIT LOGS (ดูประวัติการแก้ไข)
// ============================================================
router.get('/audit-logs', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  res.json(rows);
});

// ============================================================
// เปลี่ยนรหัสผ่าน Admin
// ============================================================
router.post('/change-password', [body('current_password').notEmpty(), body('new_password').isLength({ min: 8 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });

  const [[admin]] = await pool.query('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
  const ok = await bcrypt.compare(req.body.current_password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });

  const hash = await bcrypt.hash(req.body.new_password, 10);
  await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [hash, admin.id]);
  await logAction({ admin: req.admin, action: 'CHANGE_PASSWORD', table_name: 'admins', record_id: admin.id, ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
