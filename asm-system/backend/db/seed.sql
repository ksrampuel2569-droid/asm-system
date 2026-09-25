-- ============================================================
-- Seed Data: หมู่บ้าน 5 แห่ง, อสม. 60 คน (รายชื่อชุดล่าสุดตามที่กำหนด), Admin เริ่มต้น
-- รันครั้งเดียวหลังสร้าง schema.sql (สคริปต์นี้ใช้ INSERT IGNORE ป้องกันข้อมูลซ้ำหากรันซ้ำ)
-- ============================================================

USE asm_system;

-- บังคับ charset ของ session นี้เป็น utf8mb4 เสมอ (สำคัญมาก - ป้องกันชื่อ อสม./หมู่บ้านภาษาไทยเพี้ยน)
SET NAMES utf8mb4;

-- ---------------- หมู่บ้าน ----------------
INSERT IGNORE INTO villages (village_number, village_name) VALUES
('6',  'หมู่ 6 บ้านอำปึล'),
('7',  'หมู่ 7 บ้านโพธิ์ทอง'),
('8',  'หมู่ 8 บ้านโคกสูง'),
('16', 'หมู่ 16 บ้านไทยสันติสุข'),
('20', 'หมู่ 20 บ้านอำปึล');

-- ---------------- อสม. หมู่ 6 บ้านอำปึล (10 คน) ----------------
INSERT INTO volunteers (full_name, village_id)
SELECT n, (SELECT id FROM villages WHERE village_number='6') FROM (
  SELECT 'นางสวาท สร้างสวน' n UNION ALL SELECT 'นางบุญตัน วงศ์แปลก' UNION ALL
  SELECT 'นางฉวีวรรณ สร้อยงาม' UNION ALL SELECT 'นางพัชรี สุวรรณทอง' UNION ALL
  SELECT 'นางสุภาวนา พงาตุนัด' UNION ALL SELECT 'นายชุม สร้างสวน' UNION ALL
  SELECT 'นางสำอาง สีดา' UNION ALL SELECT 'นางสาวปพัชญา สร้างสวน' UNION ALL
  SELECT 'นางสาวบุญญารัตน์ สมเหมาะ' UNION ALL SELECT 'นางสาวสุธินันท์ พะกาแย้ม'
) t;

-- ---------------- อสม. หมู่ 7 บ้านโพธิ์ทอง (7 คน) ----------------
INSERT INTO volunteers (full_name, village_id)
SELECT n, (SELECT id FROM villages WHERE village_number='7') FROM (
  SELECT 'นางไทรทอง วงค์ลคร' n UNION ALL SELECT 'นางพรไสว จริยะกิจเจริญกุล' UNION ALL
  SELECT 'นางประทุมวัน พระนารินทร์' UNION ALL SELECT 'นางสาวพรเสน่ห์ สุภาษา' UNION ALL
  SELECT 'นางวันทนา แก้วม่วง' UNION ALL SELECT 'นางเพียรวลี กงทวี' UNION ALL
  SELECT 'นางพัตรา หารศรีภูมิ'
) t;

-- ---------------- อสม. หมู่ 8 บ้านโคกสูง (18 คน - ชุดล่าสุด) ----------------
INSERT INTO volunteers (full_name, village_id)
SELECT n, (SELECT id FROM villages WHERE village_number='8') FROM (
  SELECT 'นางวริทยา สุขประสพ' n UNION ALL SELECT 'นางสุจิตรา ศาลางาม' UNION ALL
  SELECT 'นางไพรี เพียรไทสงค์' UNION ALL SELECT 'นางสุด ดีชอบ' UNION ALL
  SELECT 'นางอำนวย แรมดงบัง' UNION ALL SELECT 'นางจันเพ็ญ งามเลิศ' UNION ALL
  SELECT 'นายชินโชติ ผมพุ่ย' UNION ALL SELECT 'นางแสงจันทร์ จันทร์หา' UNION ALL
  SELECT 'นางยุภา สิทธิตรา' UNION ALL SELECT 'นางสุกัญญารัตน์ ศรีวรรณชัย' UNION ALL
  SELECT 'นางศรีอัมพร รูปขำ' UNION ALL SELECT 'นางวะลิดา เพียรไทสงค์' UNION ALL
  SELECT 'นางมาลี สุมรัมย์' UNION ALL SELECT 'นางวรรณภา เสตะสิทธิ์' UNION ALL
  SELECT 'นางสาวกันต์สินี แก้วสมรักษ์' UNION ALL SELECT 'นางบัวลี โพธิ์ทอง' UNION ALL
  SELECT 'นางสาวอุมาพร แรมดงบัง' UNION ALL SELECT 'นายประทีป ประดับศรี'
) t;

-- ---------------- อสม. หมู่ 16 บ้านไทยสันติสุข (12 คน) ----------------
INSERT INTO volunteers (full_name, village_id)
SELECT n, (SELECT id FROM villages WHERE village_number='16') FROM (
  SELECT 'นายนันทวัฒน์ นุสิทธิ์รัมย์' n UNION ALL SELECT 'นายสมพร สีน้ำคำ' UNION ALL
  SELECT 'นางระเบียบ สุขประสพ' UNION ALL SELECT 'นางเสือง ปลายแก่น' UNION ALL
  SELECT 'นางฉวีวรรณ เพิ่มพร' UNION ALL SELECT 'นายสุวิทย์ อยู่สุข' UNION ALL
  SELECT 'นายนอม ยิ่งรุ่งเรือง' UNION ALL SELECT 'นางสาวเพ็ญนภา แซ่เท้น' UNION ALL
  SELECT 'นางสาววิมล แข่งเพ็ญแข' UNION ALL SELECT 'นางแดง บุญสร่าง' UNION ALL
  SELECT 'นายบุญรักษ์ สุดใจ' UNION ALL SELECT 'นางสายัญ สร้างสวน'
) t;

-- ---------------- อสม. หมู่ 20 บ้านอำปึล (13 คน - ชุดล่าสุด) ----------------
INSERT INTO volunteers (full_name, village_id)
SELECT n, (SELECT id FROM villages WHERE village_number='20') FROM (
  SELECT 'นายเบีย ยิ่งรุ่งเรือง' n UNION ALL SELECT 'นางเสาวนีย์ พงศ์พิละ' UNION ALL
  SELECT 'นางพิมพ์พรรณ ศรีเจียม' UNION ALL SELECT 'นางคำนวน ยิ่งเชิดสุข' UNION ALL
  SELECT 'นางสรณ์สิริ ยิ่งเจนจบ' UNION ALL SELECT 'นางสงบ สมเสร็จ' UNION ALL
  SELECT 'นางคำไลย์ โสนาพูน' UNION ALL SELECT 'นางผลิต สูงเจริญ' UNION ALL
  SELECT 'นางสาวเตย แก่ฉลาด' UNION ALL SELECT 'นางสาวสุมณฑา ใยพิมพ์' UNION ALL
  SELECT 'นางนิรมล ยิ่งรุ่งเรือง' UNION ALL SELECT 'นางภิการัตน์ เชื้อจันทร์' UNION ALL
  SELECT 'นางอำไพ ทองใบ'
) t;

-- ---------------- Admin เริ่มต้น ----------------
-- username: admin  |  password: ChangeMe#2026
-- *** สำคัญ: ต้องเปลี่ยนรหัสผ่านนี้ทันทีหลังติดตั้งจริง ***
INSERT IGNORE INTO admins (username, password_hash, full_name, role)
VALUES ('admin', '$2b$10$u/l/tjQPayJs/T3X9NTGa.8uBt7RWUAtQWT7guw8Fi.g4DnG3Gua2', 'ผู้ดูแลระบบ', 'ADMIN');
