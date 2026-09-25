# ระบบภารกิจ อสม. ประจำสัปดาห์ (เฝ้าระวังผู้ถูกสัตว์กัด)

Phase 2: ระบบเต็มรูปแบบ (Backend + MySQL + Frontend) พร้อมติดตั้งใช้งานจริง

## ภาพรวมสถาปัตยกรรม

```
[อสม. เปิดลิงก์ผ่าน LINE]        [เจ้าหน้าที่ เปิด Browser]
            │                              │
            └───────────► Frontend (Static HTML/JS) ◄───────┘
                                   │  fetch /api/*
                                   ▼
                         Backend: Node.js + Express (JWT Auth)
                                   │
                                   ▼
                         MySQL / MariaDB (utf8mb4)
```

- **Backend:** Node.js + Express + mysql2, อยู่ใน `backend/`
- **Frontend:** Static HTML/JS (Vanilla, ไม่ต้อง build), อยู่ใน `frontend/public/`, เสิร์ฟโดย Backend เดียวกัน (ไม่ต้องตั้งค่า CORS ซับซ้อน)
- **Database:** MySQL/MariaDB, Schema อยู่ใน `backend/db/schema.sql`, Seed data อยู่ใน `backend/db/seed.sql`

---

## วิธีติดตั้งแบบเร็วที่สุด (Docker)

ต้องมี Docker และ Docker Compose ติดตั้งบน Server แล้ว

```bash
cd asm-system
cp backend/.env.example backend/.env
# แก้ไขค่าใน backend/.env ให้เรียบร้อย (โดยเฉพาะ JWT_SECRET และรหัสผ่าน DB)

docker compose up -d --build
```

ระบบจะพร้อมใช้งานที่ `http://<server-ip>:4000`
- หน้า อสม.: `http://<server-ip>:4000/`
- Admin Dashboard: กดปุ่ม "สำหรับเจ้าหน้าที่" ที่หน้าแรก

**Default Admin:** username: `admin` / password: `ChangeMe#2026`
**ต้องเข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านทันที** ผ่าน API `POST /api/admin/change-password`

---

## วิธีติดตั้งแบบ Manual (ไม่ใช้ Docker)

### 1. เตรียม Server
- Node.js 18+ (แนะนำ 20+)
- MySQL 8+ หรือ MariaDB 10.6+
- (สำหรับฟีเจอร์ Backup) ติดตั้ง `mysql-client` เพื่อให้มีคำสั่ง `mysqldump`/`mysql`

### 2. สร้างฐานข้อมูล

```bash
# สำคัญมาก: ต้องใส่ --default-character-set=utf8mb4 ทุกครั้งที่รันคำสั่งนี้
# มิเช่นนั้นชื่อ อสม./หมู่บ้านภาษาไทยจะเพี้ยน (เกิดปัญหา double-encoding) หาก Server
# ใช้ locale แบบ POSIX/C (พบบ่อยใน Server ขั้นต่ำ) — ไฟล์ .sql เองก็มี SET NAMES utf8mb4
# กำกับไว้อีกชั้นแล้ว แต่ใส่ flag นี้ไว้ด้วยเพื่อความชัวร์สูงสุด
mysql --default-character-set=utf8mb4 -u root -p < backend/db/schema.sql
mysql --default-character-set=utf8mb4 -u root -p < backend/db/seed.sql

# สร้าง user แยกสำหรับแอป (แนะนำ ไม่ควรใช้ root)
mysql -u root -p -e "
  CREATE USER 'asm_user'@'%' IDENTIFIED BY 'รหัสผ่านที่ปลอดภัย';
  GRANT ALL PRIVILEGES ON asm_system.* TO 'asm_user'@'%';
  FLUSH PRIVILEGES;"
```

### 3. ติดตั้ง Dependencies

```bash
cd backend
npm install
```

### 4. ตั้งค่า Environment Variables

```bash
cp .env.example .env
# แก้ไขค่าต่างๆ ใน .env ให้ตรงกับ Server จริง
```

**สำคัญ:** ต้องเปลี่ยน `JWT_SECRET` เป็นค่าสุ่มที่คาดเดายาก เช่น
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 5. Run Application

```bash
npm start
# หรือใช้ pm2 เพื่อรันแบบถาวรใน Production
npm install -g pm2
pm2 start src/server.js --name asm-system
pm2 save
pm2 startup
```

### 6. สร้างภารกิจสัปดาห์แรก

เข้าสู่ระบบ Admin แล้วเรียก API (ผ่านเครื่องมืออย่าง Postman หรือ curl):

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe#2026"}' | jq -r .token)

curl -X POST http://localhost:4000/api/admin/missions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "year": 2569, "week_number": 39,
    "title": "ภารกิจเฝ้าระวังสัปดาห์ที่ 39 ปี 2569",
    "start_datetime": "2026-09-22 00:00:00",
    "deadline_datetime": "2026-09-25 23:59:00"
  }'
```

ลิงก์ที่ส่งใน LINE (ระบุภารกิจตรงตาม token เพื่อความชัดเจน):
```
https://<โดเมนของคุณ>/?m=<mission_token>
```
(หรือใช้ลิงก์เปล่า `https://<โดเมนของคุณ>/` ระบบจะดึงภารกิจที่ `status=OPEN` ล่าสุดให้อัตโนมัติ)

### 7. ตั้งค่า Backup อัตโนมัติรายวัน

```bash
chmod +x backend/scripts/backup.sh
crontab -e
# เพิ่มบรรทัด (Backup ทุกวันตี 2):
0 2 * * * /path/to/asm-system/backend/scripts/backup.sh >> /var/log/asm-backup.log 2>&1
```

### 8. ตั้งค่า Reverse Proxy + HTTPS (แนะนำ nginx + Let's Encrypt)

ตัวอย่าง nginx config เบื้องต้น:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
จากนั้นใช้ `certbot --nginx` เพื่อขอใบรับรอง HTTPS ฟรี (จำเป็น เพราะข้อมูลมีความอ่อนไหว)

---

## API หลัก (สรุป)

| Method | Endpoint | คำอธิบาย | ต้อง Login |
|---|---|---|---|
| GET | `/api/villages` | รายชื่อหมู่บ้าน | ไม่ |
| GET | `/api/villages/:id/volunteers` | รายชื่อ อสม. ในหมู่บ้าน | ไม่ |
| GET | `/api/missions/current` | ภารกิจที่เปิดอยู่ล่าสุด | ไม่ |
| GET | `/api/missions/token/:token` | ภารกิจตาม token เฉพาะ | ไม่ |
| POST | `/api/surveys` | ส่ง/แก้ไขรายงาน | ไม่ |
| POST | `/api/auth/login` | เข้าสู่ระบบเจ้าหน้าที่ | ไม่ |
| GET | `/api/admin/dashboard` | ภาพรวม Dashboard | ✅ |
| GET/POST | `/api/admin/missions` | จัดการภารกิจ | ✅ |
| GET/PUT | `/api/admin/villages` | จัดการหมู่บ้าน | ✅ |
| GET/POST/PUT | `/api/admin/volunteers` | จัดการ อสม. | ✅ |
| GET | `/api/admin/statistics` | สถิติ | ✅ |
| GET | `/api/admin/export/excel` | Export ไฟล์ .xlsx | ✅ |
| POST/GET | `/api/admin/backup` | สำรอง/ดูรายการ Backup | ✅ |
| POST | `/api/admin/backup/restore` | กู้คืนข้อมูล | ✅ |
| GET | `/api/admin/audit-logs` | ประวัติการแก้ไข | ✅ |

---

## สิ่งที่ทำครบแล้วใน Phase 2

- ✅ Database Schema ครบ (villages, volunteers, weekly_missions, surveys, bite_exposures, counseling, houses/house_assignments, audit_logs, admins)
- ✅ Seed data อสม. ครบ 60 คน 5 หมู่บ้าน (ไม่ได้เดา/แก้ไขรายชื่อ)
- ✅ Backend API พร้อม Validation ฝั่ง Server, Transaction, ป้องกัน Submit ซ้ำ (unique constraint)
- ✅ Star Status คำนวณจากข้อมูลจริง ไม่ hard-code สี
- ✅ Admin Login ด้วย JWT + bcrypt, ไม่มี Dashboard สาธารณะ
- ✅ Dashboard: สถิติภาพรวม, Grid อสม. x สถานะ, รายชื่อผู้ถูกกัด
- ✅ Export Excel จริง (.xlsx, 3 Sheet, ภาษาไทยไม่เพี้ยน)
- ✅ Backup/Restore ผ่าน mysqldump + Cron script รายวัน
- ✅ Audit Log บันทึกการแก้ไขข้อมูลสำคัญ
- ✅ Frontend Mobile-first ตัวอักษร/ปุ่มใหญ่ (ปรับสำหรับผู้สูงอายุ)
- ✅ Error message ภาษาไทยทั้งหมด, ไม่โชว์ SQL error ให้ผู้ใช้เห็น

## สิ่งที่ยังเป็นส่วนต่อขยาย (แจ้งไว้ตรงไปตรงมา ไม่เดาให้)

- ⏳ **หน้า UI สำหรับ Admin CRUD หมู่บ้าน/อสม./ภารกิจ** — ตอนนี้ทำผ่าน API โดยตรง (curl/Postman) แนะนำให้แจ้งความต้องการเพิ่มเติมหากต้องการหน้าจอ Admin แบบเต็มรูปแบบ (สร้างภารกิจใหม่, แก้ไขรายชื่อ อสม., Import ข้อมูลบ้าน)
- ⏳ **PWA Service Worker แบบเต็ม** — ใส่ manifest.json ไว้แล้ว แต่ยังไม่มี offline caching / add-to-homescreen prompt เต็มรูปแบบ และยังไม่มีไฟล์ไอคอน (icon-192.png, icon-512.png) กรุณาเตรียมไฟล์โลโก้แล้ววางไว้ที่ `frontend/public/`
- ⏳ **ข้อมูลบ้าน (houses/house_assignments)** — สร้างตารางรองรับไว้แล้วตามที่กำหนด แต่ยังไม่มี UI/API สำหรับ Import เนื่องจากยังไม่มีไฟล์ข้อมูลจริง
- ⏳ **Automated Tests** — ยังไม่ได้เขียนชุดทดสอบอัตโนมัติ (Phase 14 ตามแผนเดิม)

## ข้อสันนิษฐาน (Assumptions) ที่ใช้ในการพัฒนา

1. **คำแนะนำ 4 ข้อ** ในเอกสารต้นฉบับถามครั้งเดียวต่อ 1 รายงาน (ไม่แยกรายบุคคล) แต่ Schema ที่กำหนดผูก `counseling` กับ `bite_exposures` แบบ 1:1 — ระบบจึงบันทึกคำตอบชุดเดียวกันซ้ำในทุกคนของรายงานนั้น เพื่อให้สอดคล้องกับทั้ง UX (ถามครั้งเดียว) และ Schema ที่กำหนดไว้
2. **รหัสผ่าน Admin เริ่มต้น** ตั้งเป็น `ChangeMe#2026` ชั่วคราว ต้องเปลี่ยนทันทีหลังติดตั้ง
3. **PIN สำหรับ อสม.** ยังไม่เปิดใช้งาน (ตามข้อกำหนดข้อ 44 ที่ไม่บังคับ) หากต้องการเพิ่มความปลอดภัยระดับ อสม. แจ้งเพิ่มเติมได้
