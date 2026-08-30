import * as SQLite from 'expo-sqlite';
import { DATABASE_VERSION, getDatabase, migrateDatabase } from '../data/database';
import { FileSystem, ensurePrivateDirectories, privateRoot } from '../data/files';
import { getCounts } from '../data/repository';

export type DiagnosticResult = { name: string; passed: boolean; detail: string };

export async function runLocalDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const db = await getDatabase();
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  results.push({ name: '主数据库完整性', passed: integrity?.integrity_check === 'ok', detail: integrity?.integrity_check ?? '无结果' });
  const foreignKeys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  results.push({ name: '外键隔离', passed: foreignKeys?.foreign_keys === 1, detail: `foreign_keys=${foreignKeys?.foreign_keys}` });

  const fixtureName = 'pawprint-migration-fixture.db';
  const fixturePath = `${SQLite.defaultDatabaseDirectory.replace(/\/$/, '')}/${fixtureName}`;
  const fixtureUri = fixturePath.startsWith('file://') ? fixturePath : `file://${fixturePath}`;
  const cleanFixture = async () => {
    await FileSystem.deleteAsync(fixtureUri, { idempotent: true });
    await FileSystem.deleteAsync(`${fixtureUri}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${fixtureUri}-shm`, { idempotent: true });
  };
  await cleanFixture();
  const fixture = await SQLite.openDatabaseAsync(fixtureName);
  try {
    await migrateDatabase(fixture);
    const version = await fixture.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const fixtureIntegrity = await fixture.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    results.push({ name: '数据库从零迁移', passed: version?.user_version === DATABASE_VERSION && fixtureIntegrity?.integrity_check === 'ok', detail: `version=${version?.user_version}, integrity=${fixtureIntegrity?.integrity_check}` });
  } finally {
    await fixture.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    await fixture.closeAsync();
    await cleanFixture();
  }

  await ensurePrivateDirectories();
  const probe = `${privateRoot()}generated/diagnostic-probe.txt`;
  await FileSystem.writeAsStringAsync(probe, 'pawprint-local-only');
  const readBack = await FileSystem.readAsStringAsync(probe);
  await FileSystem.deleteAsync(probe, { idempotent: true });
  results.push({ name: '私有文件读写', passed: readBack === 'pawprint-local-only', detail: '写入、读取、清理完成' });

  const counts = await getCounts();
  results.push({ name: '业务表可查询', passed: Object.keys(counts).length === 8, detail: JSON.stringify(counts) });
  return results;
}
