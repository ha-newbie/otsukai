import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMPORT_BYTES } from '../domain/recipe-import';
import { fetchRecipePage } from './recipe-import';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('制限を回避しないページ取得', () => {
  it('通常のCORS通信でHTMLを取得し、cookieとreferrerを送らない', async () => {
    const request = vi.fn(async () => new Response('<html>レシピ</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    vi.stubGlobal('fetch', request);
    expect(await fetchRecipePage('https://example.com/recipe')).toBe('<html>レシピ</html>');
    expect(request).toHaveBeenCalledWith('https://example.com/recipe', expect.objectContaining({ mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' }));
  });
  it('CORS・転送拒否やHTTPエラーで貼り付け方法を案内する', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchRecipePage('https://example.com')).rejects.toThrow('貼り付け');
    vi.stubGlobal('fetch', async () => new Response('', { status: 403 }));
    await expect(fetchRecipePage('https://example.com')).rejects.toThrow('HTTP 403');
  });
  it('https以外とHTML/JSON以外を拒否する', async () => {
    await expect(fetchRecipePage('http://example.com')).rejects.toThrow('https');
    vi.stubGlobal('fetch', async () => new Response('image', { headers: { 'content-type': 'image/png' } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toThrow('HTML・JSON以外');
  });
  it('content-lengthがなくても実際のバイト数で大きなレスポンスを中断する', async () => {
    vi.stubGlobal('fetch', async () => new Response('a'.repeat(MAX_IMPORT_BYTES + 1), { headers: { 'content-type': 'text/html' } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toThrow('2MB');
  });
  it('応答停止時は12秒で取得を中断する', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const result = expect(fetchRecipePage('https://example.com')).rejects.toThrow('タイムアウト');
    await vi.advanceTimersByTimeAsync(12000); await result;
  });
});
