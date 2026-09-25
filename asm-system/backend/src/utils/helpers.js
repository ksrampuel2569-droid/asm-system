// ============================================================
// Business logic กลาง — ห้าม Hard-code ในหลายที่ (ตาม requirement ข้อ 56)
// ============================================================

// คำนวณจำนวนวันตั้งแต่วันที่ถูกกัด ถึง "วันนี้" (ใช้เวลาไทย)
function daysSinceBite(biteDateStr) {
  if (!biteDateStr) return null;
  const bite = new Date(biteDateStr + 'T00:00:00+07:00');
  const now = new Date();
  const todayBangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  todayBangkok.setHours(0, 0, 0, 0);
  bite.setHours(0, 0, 0, 0);
  return Math.round((todayBangkok - bite) / 86400000);
}

// สถานะการส่ง: ตรงเวลา หรือ ล่าช้า — เทียบกับ deadline ของ mission
function computeSubmissionStatus(submittedAt, deadline) {
  return new Date(submittedAt) > new Date(deadline) ? 'LATE' : 'SUBMITTED';
}

// Star status คำนวณจาก "ข้อมูลจริง" ไม่ใช่ค่าที่บันทึกตรงๆ (ตาม requirement ข้อ 24)
// survey: { survey_result, submission_status } | null (null = ยังไม่รายงานเลย)
function computeStar(survey) {
  if (!survey) return { color: 'none', label: 'ยังไม่รายงาน' };
  if (survey.submission_status === 'LATE') return { color: 'red', label: 'ส่งล่าช้า' };
  if (survey.survey_result === 'NO_BITE') return { color: 'blue', label: 'ไม่พบผู้ถูกกัด (ตรงเวลา)' };
  return { color: 'gold', label: 'พบผู้ถูกกัด รายงานครบ (ตรงเวลา)' };
}

function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

module.exports = { daysSinceBite, computeSubmissionStatus, computeStar, isoWeekNumber };
