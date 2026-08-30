export function isSafeBackupPath(path: string): boolean {
  return !!path && !path.startsWith('/') && !path.startsWith('\\') && !path.includes('..') && !path.includes('\\');
}
