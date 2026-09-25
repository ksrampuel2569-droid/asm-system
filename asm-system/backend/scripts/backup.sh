#!/bin/bash
# สคริปต์สำหรับตั้ง Cron Backup ฐานข้อมูลรายวัน (ไม่กระทบ Production เพราะใช้ --single-transaction)
# ตัวอย่างการตั้ง Cron (Backup ทุกวันตี 2): 
#   0 2 * * * /path/to/asm-system/backend/scripts/backup.sh >> /var/log/asm-backup.log 2>&1

set -e
cd "$(dirname "$0")/.."
set -a
source .env
set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
FILENAME="backup-$(date +%Y-%m-%d_%H-%M-%S).sql"

MYSQL_PWD="$DB_PASSWORD" mysqldump \
  -h"$DB_HOST" -P"${DB_PORT:-3306}" -u"$DB_USER" \
  --default-character-set=utf8mb4 \
  --single-transaction --routines --triggers \
  "$DB_NAME" > "$BACKUP_DIR/$FILENAME"

echo "[$(date)] Backup created: $BACKUP_DIR/$FILENAME"

# เก็บไฟล์ Backup ย้อนหลังไว้ 30 วัน ลบไฟล์ที่เก่ากว่านั้นทิ้ง
find "$BACKUP_DIR" -name "backup-*.sql" -mtime +30 -delete
