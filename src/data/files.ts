import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

const ROOT_NAME = 'pawprint-data';

export function privateRoot(): string {
  if (!FileSystem.documentDirectory) throw new Error('应用私有目录不可用');
  return `${FileSystem.documentDirectory}${ROOT_NAME}/`;
}

export function resolvePrivateUri(relativePath: string | null): string | null {
  if (!relativePath) return null;
  return `${privateRoot()}${relativePath}`;
}

export async function ensurePrivateDirectories(): Promise<void> {
  const root = privateRoot();
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  for (const folder of ['photos', 'timeline', 'attachments', 'generated']) {
    await FileSystem.makeDirectoryAsync(`${root}${folder}/`, { intermediates: true });
  }
}

function safeExtension(name: string | null | undefined, mimeType?: string | null): string {
  const match = name?.match(/\.([a-zA-Z0-9]{1,8})$/);
  if (match?.[1]) return match[1].toLowerCase();
  const mime = mimeType?.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-zA-Z0-9]/g, '');
  return mime || 'bin';
}

export async function importPrivateFile(
  sourceUri: string,
  category: 'photos' | 'timeline' | 'attachments',
  petId: string,
  originalName?: string | null,
  mimeType?: string | null,
): Promise<string> {
  await ensurePrivateDirectories();
  const extension = safeExtension(originalName ?? sourceUri, mimeType);
  const relative = `${category}/${petId}/${Crypto.randomUUID()}.${extension}`;
  const destination = resolvePrivateUri(relative)!;
  await FileSystem.makeDirectoryAsync(destination.slice(0, destination.lastIndexOf('/') + 1), { intermediates: true });
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  const info = await FileSystem.getInfoAsync(destination);
  if (!info.exists || !('size' in info) || !info.size) throw new Error('复制文件失败');
  return relative;
}

export async function removePrivateFile(relativePath: string): Promise<void> {
  const uri = resolvePrivateUri(relativePath)!;
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function listPrivateFiles(directory = privateRoot(), prefix = ''): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) return [];
  const children = await FileSystem.readDirectoryAsync(directory);
  const files: string[] = [];
  for (const child of children) {
    const childUri = `${directory}${child}`;
    const childInfo = await FileSystem.getInfoAsync(childUri);
    if (childInfo.isDirectory) files.push(...await listPrivateFiles(`${childUri}/`, `${prefix}${child}/`));
    else files.push(`${prefix}${child}`);
  }
  return files;
}

export { FileSystem };
