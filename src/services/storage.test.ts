import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistence, saveBackupFile, storageStatus } from './storage';

afterEach(() => vi.unstubAllGlobals());
describe('安全なStorage API呼出', () => {
  it('未対応のブラウザでも例外なく状態を返す', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistence()).toBe(false);
    expect(await storageStatus()).toEqual({ supported: false, persisted: false, usage: null, quota: null });
  });
  it('許可・拒否をそのまま返す', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => true } });
    expect(await requestPersistence()).toBe(true);
    vi.stubGlobal('navigator', { storage: { persist: async () => false } });
    expect(await requestPersistence()).toBe(false);
  });
  it('persist/persisted/estimateの例外を安全に処理する', async () => {
    const failure = async () => { throw new Error('unsupported'); };
    vi.stubGlobal('navigator', { storage: { persist: failure, persisted: failure, estimate: failure } });
    expect(await requestPersistence()).toBe(false);
    expect(await storageStatus()).toEqual({ supported: true, persisted: false, usage: null, quota: null });
  });
  it('実際の状態と使用量を報告する', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => true, persisted: async () => true, estimate: async () => ({ usage: 100, quota: 1000 }) } });
    expect(await storageStatus()).toEqual({ supported: true, persisted: true, usage: 100, quota: 1000 });
  });
});
describe('ファイル共有', () => {
  it('対応時はJSONファイルを共有する', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await saveBackupFile('{}')).toBe('shared');
    expect(share.mock.calls[0]).toBeDefined();
  });
  it('共有キャンセルを成功として扱わない', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new DOMException('cancel', 'AbortError'); } });
    expect(await saveBackupFile('{}')).toBe('cancelled');
  });
  it('共有エラー時はユーザーに保存方法を伝える', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new Error('denied'); } });
    await expect(saveBackupFile('{}')).rejects.toThrow('ダウンロード保存');
  });
});
