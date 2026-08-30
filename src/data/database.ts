import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'pawprint.db';
export const DATABASE_VERSION = 3;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await migrateDatabase(database);
      return database;
    });
  }
  return databasePromise;
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return;
  const database = await databasePromise;
  await database.closeAsync();
  databasePromise = null;
}

export async function migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = result?.user_version ?? 0;

  if (version < 1) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY NOT NULL,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pets (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          species TEXT NOT NULL,
          breed TEXT NOT NULL DEFAULT '',
          sex TEXT NOT NULL DEFAULT '',
          birth_date TEXT,
          home_date TEXT,
          color TEXT NOT NULL DEFAULT '',
          initial_weight REAL,
          neutered INTEGER NOT NULL DEFAULT 0,
          neutered_date TEXT,
          microchip TEXT NOT NULL DEFAULT '',
          allergies TEXT NOT NULL DEFAULT '',
          chronic_conditions TEXT NOT NULL DEFAULT '',
          long_term_medications TEXT NOT NULL DEFAULT '',
          hospital TEXT NOT NULL DEFAULT '',
          veterinarian TEXT NOT NULL DEFAULT '',
          hospital_phone TEXT NOT NULL DEFAULT '',
          owner_phone TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE TABLE IF NOT EXISTS pet_photos (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          relative_path TEXT NOT NULL UNIQUE,
          position INTEGER NOT NULL,
          is_primary INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS one_primary_photo_per_pet
          ON pet_photos(pet_id) WHERE is_primary = 1;
        CREATE TABLE IF NOT EXISTS care_types (
          id TEXT PRIMARY KEY NOT NULL,
          label TEXT NOT NULL,
          is_custom INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS care_schedules (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          last_completed_date TEXT,
          due_date TEXT NOT NULL,
          recurrence_days INTEGER,
          reminder_days INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'pending',
          notes TEXT NOT NULL DEFAULT '',
          hospital TEXT NOT NULL DEFAULT '',
          cost REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS care_schedule_pet_due ON care_schedules(pet_id, due_date);
        CREATE TABLE IF NOT EXISTS care_records (
          id TEXT PRIMARY KEY NOT NULL,
          schedule_id TEXT,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          action TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          cost REAL,
          created_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE TABLE IF NOT EXISTS health_records (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          title TEXT NOT NULL,
          weight REAL,
          body_condition INTEGER,
          symptoms TEXT NOT NULL DEFAULT '',
          mood TEXT NOT NULL DEFAULT '',
          appetite TEXT NOT NULL DEFAULT '',
          water TEXT NOT NULL DEFAULT '',
          stool TEXT NOT NULL DEFAULT '',
          diagnosis TEXT NOT NULL DEFAULT '',
          treatment TEXT NOT NULL DEFAULT '',
          medication TEXT NOT NULL DEFAULT '',
          dosage TEXT NOT NULL DEFAULT '',
          frequency TEXT NOT NULL DEFAULT '',
          course TEXT NOT NULL DEFAULT '',
          cost REAL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS health_pet_time ON health_records(pet_id, occurred_at);
        CREATE TABLE IF NOT EXISTS medications (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          health_record_id TEXT,
          name TEXT NOT NULL,
          dosage TEXT NOT NULL DEFAULT '',
          frequency TEXT NOT NULL DEFAULT '',
          start_date TEXT,
          end_date TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS timeline_entries (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          title TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          relative_photo_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS timeline_pet_time ON timeline_entries(pet_id, occurred_at);
        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          owner_type TEXT NOT NULL,
          owner_id TEXT,
          category TEXT NOT NULL,
          display_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          relative_path TEXT NOT NULL UNIQUE,
          occurred_at TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY NOT NULL,
          pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          owner_type TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          amount REAL NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_jobs (
          id TEXT PRIMARY KEY NOT NULL,
          schedule_id TEXT NOT NULL UNIQUE,
          notification_id TEXT NOT NULL,
          scheduled_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trash (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          deleted_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const defaults = [
        ['vaccine', '疫苗'], ['deworm_internal', '体内驱虫'], ['deworm_external', '体外驱虫'],
        ['medication', '用药'], ['checkup', '体检'], ['bath', '洗澡'], ['grooming', '美容'],
        ['nails', '剪指甲'], ['dental', '洁牙/刷牙'], ['ears', '清洁耳朵'], ['custom', '自定义护理'],
      ];
      for (const [id, label] of defaults) {
        await txn.runAsync('INSERT OR IGNORE INTO care_types(id, label, is_custom) VALUES (?, ?, 0)', id!, label!);
      }
      await txn.runAsync('INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (1, ?)', new Date().toISOString());
      await txn.execAsync('PRAGMA user_version = 1;');
    });
    version = 1;
  }

  if (version < 2) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync('ALTER TABLE health_records ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;');
      await txn.runAsync('INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (2, ?)', new Date().toISOString());
      await txn.execAsync('PRAGMA user_version = 2;');
    });
    version = 2;
  }

  if (version < 3) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE pets ADD COLUMN target_weight_min REAL;
        ALTER TABLE pets ADD COLUMN target_weight_max REAL;
      `);
      await txn.runAsync('INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (3, ?)', new Date().toISOString());
      await txn.execAsync('PRAGMA user_version = 3;');
    });
    version = 3;
  }

  if (version !== DATABASE_VERSION) {
    throw new Error(`不支持的数据库版本：${version}`);
  }
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (integrity?.integrity_check !== 'ok') throw new Error('数据库完整性检查失败');
}
