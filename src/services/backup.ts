import JSZip from 'jszip';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { DATABASE_NAME, DATABASE_VERSION, closeDatabase, getDatabase } from '../data/database';
import { FileSystem, ensurePrivateDirectories, listPrivateFiles, privateRoot, resolvePrivateUri } from '../data/files';
import { getCounts, setSetting } from '../data/repository';
import { isSafeBackupPath } from './backupUtils';

export const BACKUP_FORMAT_VERSION = 1;

type ManifestFile = { path: string; size: number; sha256: string };
export type BackupManifest = {
  app: 'pawprint-pet-app';
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  hashMode?: 'bytes';
  createdAt: string;
  files: ManifestFile[];
  counts: Record<string, number>;
};

const databaseUri = () => {
  const path = `${SQLite.defaultDatabaseDirectory.replace(/\/$/, '')}/${DATABASE_NAME}`;
  return path.startsWith('file://') ? path : `file://${path}`;
};
const digestBase64Text = (base64: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
const bytesFromBase64Value = (base64: string) => Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
const digestBytes = async (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, copy)))
    .map((value) => value.toString(16).padStart(2, '0')).join('');
};

function bytesFromBase64(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
}

export async function createBackup(): Promise<{ uri: string; manifest: BackupManifest }> {
  const db = await getDatabase();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  await ensurePrivateDirectories();
  const zip = new JSZip();
  const manifestFiles: ManifestFile[] = [];

  const dbBase64 = await FileSystem.readAsStringAsync(databaseUri(), { encoding: FileSystem.EncodingType.Base64 });
  zip.file('database.db', dbBase64, { base64: true });
  manifestFiles.push({ path: 'database.db', size: bytesFromBase64(dbBase64), sha256: await digestBytes(bytesFromBase64Value(dbBase64)) });

  for (const relative of await listPrivateFiles()) {
    if (!isSafeBackupPath(relative)) throw new Error('发现不安全的本地文件路径');
    const base64 = await FileSystem.readAsStringAsync(resolvePrivateUri(relative)!, { encoding: FileSystem.EncodingType.Base64 });
    const path = `files/${relative}`;
    zip.file(path, base64, { base64: true });
    manifestFiles.push({ path, size: bytesFromBase64(base64), sha256: await digestBytes(bytesFromBase64Value(base64)) });
  }

  const manifest: BackupManifest = {
    app: 'pawprint-pet-app', formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: DATABASE_VERSION,
    appVersion: '1.0.1', hashMode: 'bytes', createdAt: new Date().toISOString(), files: manifestFiles, counts: await getCounts(),
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const outputBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (!FileSystem.cacheDirectory) throw new Error('缓存目录不可用');
  const stamp = manifest.createdAt.replace(/[:.]/g, '-');
  const uri = `${FileSystem.cacheDirectory}pawprint-backup-${stamp}.pawzip`;
  await FileSystem.writeAsStringAsync(uri, outputBase64, { encoding: FileSystem.EncodingType.Base64 });
  await setSetting('last_backup_at', manifest.createdAt);
  await setSetting('last_backup_uri', uri);
  return { uri, manifest };
}

export async function exportBackup(): Promise<{ uri: string; manifest: BackupManifest }> {
  const result = await createBackup();
  if (!await Sharing.isAvailableAsync()) throw new Error('当前设备不支持系统分享');
  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/zip', dialogTitle: '保存爪印日记完整备份', UTI: 'public.zip-archive',
  });
  return result;
}

export async function saveBackupToFolder(): Promise<{ uri: string; manifest: BackupManifest } | null> {
  const result = await createBackup();
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;
  const fileName = result.uri.slice(result.uri.lastIndexOf('/') + 1).replace(/\.pawzip$/, '.zip');
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, fileName, 'application/zip');
  const base64 = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: destination, manifest: result.manifest };
}

async function validateZip(zip: JSZip): Promise<{ manifest: BackupManifest; extracted: Map<string, string> }> {
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('备份缺少 manifest.json');
  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest;
  if (manifest.app !== 'pawprint-pet-app' || manifest.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error('不是受支持的爪印日记备份');
  if (manifest.schemaVersion > DATABASE_VERSION) throw new Error('备份来自更高版本，请先升级 APP');
  if (!Array.isArray(manifest.files) || !manifest.files.some((file) => file.path === 'database.db')) throw new Error('备份清单不完整');
  const extracted = new Map<string, string>();
  for (const entry of manifest.files) {
    if (!isSafeBackupPath(entry.path)) throw new Error(`备份路径不安全：${entry.path}`);
    const file = zip.file(entry.path);
    if (!file) throw new Error(`备份缺少文件：${entry.path}`);
    const base64 = await file.async('base64');
    const actualHash = manifest.hashMode === 'bytes' ? await digestBytes(bytesFromBase64Value(base64)) : await digestBase64Text(base64);
    if (actualHash !== entry.sha256 || bytesFromBase64(base64) !== entry.size) throw new Error(`备份文件校验失败：${entry.path}`);
    extracted.set(entry.path, base64);
  }
  return { manifest, extracted };
}

export async function restoreBackupFromUri(uri: string): Promise<BackupManifest> {
  const archive = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(archive, { base64: true, checkCRC32: true });
  const { manifest, extracted } = await validateZip(zip);

  const db = await getDatabase();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  const oldDb = await FileSystem.readAsStringAsync(databaseUri(), { encoding: FileSystem.EncodingType.Base64 });
  const oldFiles = new Map<string, string>();
  for (const path of await listPrivateFiles()) {
    oldFiles.set(path, await FileSystem.readAsStringAsync(resolvePrivateUri(path)!, { encoding: FileSystem.EncodingType.Base64 }));
  }

  await closeDatabase();
  try {
    await FileSystem.deleteAsync(privateRoot(), { idempotent: true });
    await ensurePrivateDirectories();
    await FileSystem.deleteAsync(databaseUri(), { idempotent: true });
    await FileSystem.deleteAsync(`${databaseUri()}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${databaseUri()}-shm`, { idempotent: true });
    await FileSystem.writeAsStringAsync(databaseUri(), extracted.get('database.db')!, { encoding: FileSystem.EncodingType.Base64 });
    for (const [path, base64] of extracted) {
      if (!path.startsWith('files/')) continue;
      const relative = path.slice('files/'.length);
      const destination = resolvePrivateUri(relative)!;
      await FileSystem.makeDirectoryAsync(destination.slice(0, destination.lastIndexOf('/') + 1), { intermediates: true });
      await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
    }
    const restored = await getDatabase();
    const integrity = await restored.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity?.integrity_check !== 'ok') throw new Error('恢复后的数据库完整性检查失败');
    await setSetting('last_restore_at', new Date().toISOString());
    return manifest;
  } catch (error) {
    await closeDatabase();
    await FileSystem.deleteAsync(privateRoot(), { idempotent: true });
    await ensurePrivateDirectories();
    await FileSystem.writeAsStringAsync(databaseUri(), oldDb, { encoding: FileSystem.EncodingType.Base64 });
    for (const [path, base64] of oldFiles) {
      const destination = resolvePrivateUri(path)!;
      await FileSystem.makeDirectoryAsync(destination.slice(0, destination.lastIndexOf('/') + 1), { intermediates: true });
      await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
    }
    await getDatabase();
    throw error;
  }
}

export async function pickAndRestoreBackup(): Promise<BackupManifest | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream', '*/*'], copyToCacheDirectory: true, multiple: false,
  });
  if (result.canceled) return null;
  return restoreBackupFromUri(result.assets[0]!.uri);
}

export { isSafeBackupPath } from './backupUtils';
