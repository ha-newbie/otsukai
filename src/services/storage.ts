export interface StorageStatus { supported: boolean; persisted: boolean; usage: number | null; quota: number | null; }
export async function storageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage;
  if (!storage) return { supported: false, persisted: false, usage: null, quota: null };
  const [persisted, estimate] = await Promise.all([
    typeof storage.persisted === 'function' ? storage.persisted().catch(() => false) : false,
    typeof storage.estimate === 'function' ? storage.estimate().catch(() => ({} as StorageEstimate)) : {} as StorageEstimate,
  ]);
  return { supported: typeof storage.persist === 'function', persisted, usage: estimate.usage ?? null, quota: estimate.quota ?? null };
}
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator.storage?.persist !== 'function') return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}
export async function saveBackupFile(json: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const filename = `otsukai-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const file = new File([json], filename, { type: 'application/json' });
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'おつかいのバックアップ' }); return 'shared'; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'; throw new Error('共有できませんでした。ダウンロード保存をお試しください'); }
  }
  downloadFile(file);
  return 'downloaded';
}
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = file.name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
