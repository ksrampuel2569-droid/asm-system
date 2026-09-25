const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../config/db');
const { computeSubmissionStatus, computeStar } = require('../utils/helpers');

const router = express.Router();

// ---------------------------------------------------------
// GET /api/villages — รายชื่อหมู่บ้านที่เปิดใช้งาน
// ---------------------------------------------------------
router.get('/villages', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, village_number, village_name FROM villages WHERE active = 1 ORDER BY CAST(village_number AS UNSIGNED)'
  );
  res.json(rows);
});

// ---------------------------------------------------------
// GET /api/villages/:id/volunteers — รายชื่อ อสม. เฉพาะหมู่บ้านนั้น
// ---------------------------------------------------------
router.get('/villages/:id/volunteers', param('id').isInt(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'รหัสหมู่บ้านไม่ถูกต้อง' });

  const [rows] = await pool.query(
    'SELECT id, full_name FROM volunteers WHERE village_id = ? AND active = 1 ORDER BY full_name',
    [req.params.id]
  );
  res.json(rows);
});

// ---------------------------------------------------------
// GET /api/missions/current — ภารกิจที่เปิดอยู่ล่าสุด (สำหรับลิงก์ทั่วไป)
// GET /api/missions/token/:token — ภารกิจตาม token เฉพาะ (สำหรับลิงก์ที่ส่งใน LINE)
// ---------------------------------------------------------
router.get('/missions/current', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, mission_token, year, week_number, title, start_datetime, deadline_datetime, status
     FROM weekly_missions WHERE status = 'OPEN' ORDER BY start_datetime DESC LIMIT 1`
  );
  if (!rows[0]) return res.status(404).json({ error: 'ขณะนี้ยังไม่มีภารกิจที่เปิดใช้งาน กรุณาติดต่อเจ้าหน้าที่' });
  res.json(rows[0]);
});

router.get('/missions/token/:token', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, mission_token, year, week_number, title, start_datetime, deadline_datetime, status
     FROM weekly_missions WHERE mission_token = ?`,
    [req.params.token]
  );
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบภารกิจนี้ ลิงก์อาจไม่ถูกต้องหรือหมดอายุ' });
  res.json(rows[0]);
});

// ---------------------------------------------------------
// POST /api/surveys — ส่งรายงานประจำสัปดาห์ (สร้างใหม่ หรือแก้ไขรายงานเดิมก่อน Deadline)
// ---------------------------------------------------------
const surveyValidation = [
  body('mission_id').isInt(),
  body('volunteer_id').isInt(),
  body('village_id').isInt(),
  body('survey_result').isIn(['NO_BITE', 'BITE_FOUND']),
  body('exposures').isArray({ max: 4 }),
  body('counseling').optional().isObject(),
];

router.post('/surveys', surveyValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบอีกครั้ง', details: errors.array() });
  }

  const { mission_id, volunteer_id, village_id, survey_result, exposures = [], counseling = {} } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ---- ตรวจสอบสิทธิ์/ความสอดคล้องฝั่ง Server (ห้ามเชื่อ Frontend อย่างเดียว) ----
    const [[mission]] = await conn.query('SELECT * FROM weekly_missions WHERE id = ? FOR UPDATE', [mission_id]);
    if (!mission) throw { status: 404, message: 'ไม่พบภารกิจนี้' };

    const [[volunteer]] = await conn.query(
      'SELECT * FROM volunteers WHERE id = ? AND village_id = ? AND active = 1',
      [volunteer_id, village_id]
    );
    if (!volunteer) throw { status: 400, message: 'ข้อมูล อสม. หรือหมู่บ้านไม่ถูกต้อง' };

    if (survey_result === 'BITE_FOUND' && (exposures.length < 1 || exposures.length > 4)) {
      throw { status: 400, message: 'จำนวนผู้ถูกกัดต้องอยู่ระหว่าง 1-4 คน' };
    }

    const submittedAt = new Date();
    const submissionStatus = computeSubmissionStatus(submittedAt, mission.deadline_datetime);

    // ---- ตรวจสอบว่ามีรายงานเดิมของ อสม. คนนี้ในภารกิจนี้แล้วหรือไม่ (unique mission+volunteer) ----
    const [[existing]] = await conn.query(
      'SELECT id FROM surveys WHERE mission_id = ? AND volunteer_id = ?',
      [mission_id, volunteer_id]
    );

    if (existing && mission.status === 'CLOSED' && !mission.allow_edit_after_deadline) {
      throw { status: 403, message: 'ภารกิจนี้ปิดรับการแก้ไขแล้ว' };
    }

    let surveyId;
    if (existing) {
      surveyId = existing.id;
      await conn.query(
        `UPDATE surveys SET survey_result=?, submitted_at=?, submission_status=?, completion_status='COMPLETE'
         WHERE id = ?`,
        [survey_result, submittedAt, submissionStatus, surveyId]
      );
      // ลบข้อมูลผู้ถูกกัด/คำแนะนำเดิม แล้วบันทึกชุดใหม่แทน (idempotent update ไม่ใช่สร้างซ้ำ)
      await conn.query('DELETE FROM bite_exposures WHERE survey_id = ?', [surveyId]);
    } else {
      const [result] = await conn.query(
        `INSERT INTO surveys (mission_id, volunteer_id, village_id, survey_result, submitted_at, submission_status, completion_status)
         VALUES (?,?,?,?,?,?,'COMPLETE')`,
        [mission_id, volunteer_id, village_id, survey_result, submittedAt, submissionStatus]
      );
      surveyId = result.insertId;
    }

    if (survey_result === 'BITE_FOUND') {
      for (const p of exposures) {
        if (!p.full_name || !p.bite_date || !p.animal_type) {
          throw { status: 400, message: 'กรุณากรอกข้อมูลผู้ถูกกัดให้ครบทุกคน' };
        }
        const [expResult] = await conn.query(
          `INSERT INTO bite_exposures
             (survey_id, person_no, full_name, sex, age, house_number, bite_date, animal_type, animal_other, bite_location, vaccination_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            surveyId, p.person_no || 1, p.full_name, p.sex || null, p.age || null,
            p.house_number || null, p.bite_date, p.animal_type, p.animal_other || null,
            p.bite_location || null, p.vaccination_status || 'unknown',
          ]
        );
        await conn.query(
          `INSERT INTO counseling
             (exposure_id, advised_doctor_24_48h, advised_wound_washing, advised_animal_observation, provided_rabies_education)
           VALUES (?,?,?,?,?)`,
          [
            expResult.insertId,
            !!counseling.advised_doctor_24_48h,
            !!counseling.advised_wound_washing,
            !!counseling.advised_animal_observation,
            !!counseling.provided_rabies_education,
          ]
        );
      }
    }

    await conn.commit();

    const star = computeStar({ survey_result, submission_status: submissionStatus });
    res.status(201).json({ survey_id: surveyId, submission_status: submissionStatus, star });
  } catch (err) {
    await conn.rollback();
    const status = err.status || 500;
    const message = err.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่';
    if (status === 500) console.error(err);
    res.status(status).json({ error: message });
  } finally {
    conn.release();
  }
});

module.exports = router;
