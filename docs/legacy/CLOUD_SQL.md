# Database on Google Cloud — Cloud SQL for MySQL 8

The backend database runs as a managed **Cloud SQL for MySQL 8.0** instance in the same Google Cloud
project as Firebase (`qwikmart-37299`). No code changes are needed — Laravel only needs new `.env`
connection values. Firestore keeps serving realtime data (see `FIREBASE.md`).

```
Flutter apps / Next.js ──► Laravel API (Cloud Run) ──► Cloud SQL MySQL 8   (source of truth)
                                    └──────────────► Firestore             (realtime mirror)
                                    └──────────────► FCM                   (push)
```

## 1. Create the instance (once)

Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), then:

```bash
gcloud auth login
gcloud config set project qwikmart-37299
gcloud services enable sqladmin.googleapis.com

# Mumbai region, close to the users. Use db-g1-small for dev, a db-custom tier for production.
gcloud sql instances create snapbuy-db \
  --database-version=MYSQL_8_0 --region=asia-south1 \
  --tier=db-custom-1-3840 --storage-size=20GB --storage-auto-increase \
  --backup-start-time=21:00 --enable-point-in-time-recovery \
  --database-flags=character_set_server=utf8mb4

gcloud sql databases create snapbuy --instance=snapbuy-db --charset=utf8mb4 --collation=utf8mb4_unicode_ci
gcloud sql users create snapbuy_app --instance=snapbuy-db --password='<strong-password>'
```

(Or in the console: SQL → Create instance → MySQL 8.0 → asia-south1.)

## 2. Connect Laravel

Pick one:

| Where Laravel runs | `.env` |
|---|---|
| **Cloud Run / App Engine** (recommended for production) | `DB_SOCKET=/cloudsql/qwikmart-37299:asia-south1:snapbuy-db`, `DB_HOST=` and deploy with `--add-cloudsql-instances=qwikmart-37299:asia-south1:snapbuy-db` |
| **Local PC / any VM** | run the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/mysql/sql-proxy): `cloud-sql-proxy qwikmart-37299:asia-south1:snapbuy-db --port 3307` then `DB_HOST=127.0.0.1`, `DB_PORT=3307` |
| **Public IP** | add your server IP under Connections → Authorized networks, download `server-ca.pem` (+ client cert/key if "require trusted client certificates" is on) and set `MYSQL_ATTR_SSL_CA` / `_CERT` / `_KEY` to their absolute paths |

Always:
```
DB_CONNECTION=mysql
DB_DATABASE=snapbuy
DB_USERNAME=snapbuy_app
DB_PASSWORD=<strong-password>
```
Then `php artisan config:clear`.

## 3. Create the schema and data

Fresh demo install:
```bash
php artisan migrate --seed --force
```

Moving the existing local data (XAMPP MariaDB) — create the schema on MySQL 8 with migrations
(native JSON columns), then copy data only:
```bash
php artisan migrate --force                         # against Cloud SQL
/f/xampp/mysql/bin/mysqldump.exe -uroot snapbuy \
  --no-create-info --complete-insert --skip-triggers --ignore-table=snapbuy.migrations \
  > snapbuy-data.sql
mysql -h 127.0.0.1 -P 3307 -u snapbuy_app -p snapbuy < snapbuy-data.sql   # through the Auth Proxy
```

## 4. Verify

```bash
php artisan migrate:status
php artisan tinker --execute="echo App\Models\Order::count();"
php artisan firebase:sync --check
```
The code was developed on MariaDB 10.4; all queries use standard MySQL 8 functions
(`JSON_EXTRACT`, `DATE_FORMAT`, `FIELD`, `DATE`) and no MariaDB-only features, but run the
migrations once against the Cloud SQL instance before switching production traffic.

## Local development

Either keep XAMPP MySQL locally (`DB_HOST=127.0.0.1`, `DB_PORT=3306`) or point local Laravel at
Cloud SQL through the Auth Proxy. Production should use only Cloud SQL.
