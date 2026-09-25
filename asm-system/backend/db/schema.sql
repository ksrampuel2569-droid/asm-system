-- ============================================================
-- ระบบภารกิจ อสม. ประจำสัปดาห์ — Database Schema
-- Engine: MySQL 8 / MariaDB 10.6+
-- Charset: utf8mb4 (รองรับภาษาไทยและอีโมจิ)
-- ============================================================

CREATE DATABASE IF NOT EXISTS asm_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE asm_system;

-- บังคับ charset ของ session นี้เป็น utf8mb4 เสมอ ไม่ว่า client/locale ของเครื่องที่รันคำสั่งจะตั้งค่าอย่างไร
-- (ป้องกันปัญหาภาษาไทยเพี้ยน/ถูกเข้ารหัสซ้ำซ้อนเวลารัน `mysql < schema.sql` บน Server ที่ locale เป็น POSIX/C)
SET NAMES utf8mb4;

-- ---------------------------------------------------------
-- หมู่บ้าน
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS villages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  village_number VARCHAR(10) NOT NULL,
  village_name VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_village_number (village_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- อสม.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  sex ENUM('ชาย','หญิง') DEFAULT NULL,
  village_id INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_volunteers_village FOREIGN KEY (village_id) REFERENCES villages(id),
  INDEX idx_volunteers_village (village_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- เจ้าหน้าที่ / Admin
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- ภารกิจรายสัปดาห์
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_missions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mission_token VARCHAR(64) NOT NULL,
  year INT NOT NULL,
  week_number INT NOT NULL,
  title VARCHAR(255),
  start_datetime DATETIME NOT NULL,
  deadline_datetime DATETIME NOT NULL,
  late_until_datetime DATETIME DEFAULT NULL,
  allow_edit_after_deadline TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_mission_token (mission_token),
  UNIQUE KEY uniq_year_week (year, week_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- รายงานของ อสม. ต่อภารกิจ (1 คน : 1 รายงาน : 1 ภารกิจ)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mission_id INT NOT NULL,
  volunteer_id INT NOT NULL,
  village_id INT NOT NULL,
  survey_result ENUM('NO_BITE','BITE_FOUND') NOT NULL,
  submitted_at DATETIME NOT NULL,
  submission_status ENUM('SUBMITTED','LATE') NOT NULL,
  completion_status ENUM('COMPLETE','INCOMPLETE') NOT NULL DEFAULT 'COMPLETE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_surveys_mission FOREIGN KEY (mission_id) REFERENCES weekly_missions(id),
  CONSTRAINT fk_surveys_volunteer FOREIGN KEY (volunteer_id) REFERENCES volunteers(id),
  CONSTRAINT fk_surveys_village FOREIGN KEY (village_id) REFERENCES villages(id),
  UNIQUE KEY uniq_mission_volunteer (mission_id, volunteer_id),
  INDEX idx_surveys_mission (mission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- ข้อมูลผู้ถูกสัตว์กัดในแต่ละรายงาน (สูงสุด 4 คน/รายงาน)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bite_exposures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  person_no INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  sex ENUM('ชาย','หญิง'),
  age INT,
  house_number VARCHAR(50),
  bite_date DATE NOT NULL,
  animal_type ENUM('dog','cat','cow','squirrel','other') NOT NULL,
  animal_other VARCHAR(100),
  bite_location VARCHAR(50),
  vaccination_status ENUM('vaccinated','not_vaccinated','unknown') NOT NULL DEFAULT 'unknown',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_exposure_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  INDEX idx_exposure_survey (survey_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- คำแนะนำที่ อสม. ให้แก่ผู้ถูกกัด (1:1 กับ bite_exposures)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS counseling (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exposure_id INT NOT NULL,
  advised_doctor_24_48h TINYINT(1) NOT NULL DEFAULT 0,
  advised_wound_washing TINYINT(1) NOT NULL DEFAULT 0,
  advised_animal_observation TINYINT(1) NOT NULL DEFAULT 0,
  provided_rabies_education TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_counseling_exposure FOREIGN KEY (exposure_id) REFERENCES bite_exposures(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_counseling_exposure (exposure_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- บ้าน / เขตรับผิดชอบ (โครงสร้างรองรับอนาคต - ยังไม่ import ข้อมูลจริง)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS houses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  village_id INT NOT NULL,
  house_number VARCHAR(50) NOT NULL,
  address_detail VARCHAR(255),
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_houses_village FOREIGN KEY (village_id) REFERENCES villages(id),
  UNIQUE KEY uniq_house_per_village (village_id, house_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS house_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  house_id INT NOT NULL,
  volunteer_id INT NOT NULL,
  start_date DATE,
  end_date DATE,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_assign_house FOREIGN KEY (house_id) REFERENCES houses(id),
  CONSTRAINT fk_assign_volunteer FOREIGN KEY (volunteer_id) REFERENCES volunteers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- Audit Log — ติดตามการแก้ไขข้อมูลโดยเจ้าหน้าที่
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT,
  admin_username VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  record_id INT,
  old_value JSON,
  new_value JSON,
  ip_address VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
