import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMPORT_BYTES } from '../domain/recipe-import';
import { fetchRecipePage } from './recipe-import';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('制限を回避しないページ取得', () => {
  it('通常のCORS通信でHTMLを取得し、cookieとreferrerを送らない', async () => {
    const request = vi.fn(async () => new Response('<html>レシピ</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    vi.stubGlobal('fetch', request);
    expect(await fetchRecipePage('https://example.com/recipe')).toBe('<html>レシピ</html>');
    expect(request).toHaveBeenCalledWith('https://example.com/recipe', expect.objectContaining({ mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', cache: 'no-store' }));
  });
  it('読取不可とHTTPエラーを異なるコードで返し、見えないHTTP状態は作らない', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2003', context: { url: 'https://example.com/' } });
    vi.stubGlobal('fetch', async () => new Response('', { status: 403 }));
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2004', context: { httpStatus: 403 } });
  });
  it('https以外とHTML/JSON以外を拒否する', async () => {
    await expect(fetchRecipePage('http://example.com')).rejects.toMatchObject({ code: 'IMP-1002' });
    vi.stubGlobal('fetch', async () => new Response('image', { headers: { 'content-type': 'image/png' } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2005' });
  });
  it('content-lengthがなくても実際のバイト数で大きなレスポンスを中断する', async () => {
    vi.stubGlobal('fetch', async () => new Response('a'.repeat(MAX_IMPORT_BYTES + 1), { headers: { 'content-type': 'text/html' } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2006' });
  });
  it('応答停止時は12秒で取得を中断する', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const result = expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2002' });
    await vi.advanceTimersByTimeAsync(12000); await result;
  });
  it('オフラインは通信前に判定し、空URLと不正URLも区別する', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request); vi.stubGlobal('navigator', { onLine: false });
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2001' });
    expect(request).not.toHaveBeenCalled();
    await expect(fetchRecipePage('')).rejects.toMatchObject({ code: 'IMP-1003' });
    await expect(fetchRecipePage('not-a-url')).rejects.toMatchObject({ code: 'IMP-1001' });
  });
  it('空応答、未知の文字コード、転送後の不正URLを区別する', async () => {
    vi.stubGlobal('fetch', async () => new Response(' ', { headers: { 'content-type': 'text/html' } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2007' });
    vi.stubGlobal('fetch', async () => new Response('html', { headers: { 'content-type': 'text/html; charset=unknown-encoding' } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2008' });
    const response = new Response('html', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: 'http://example.com/final' });
    vi.stubGlobal('fetch', async () => response);
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2009' });
  });
  it('型ヘッダーの余白を受け入れ、ヘッダーのサイズ制限も守る', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html></html>', { headers: { 'content-type': 'text/html ; charset=utf-8' } }));
    expect(await fetchRecipePage('https://example.com')).toBe('<html></html>');
    vi.stubGlobal('fetch', async () => new Response('small', { headers: { 'content-type': 'text/html', 'content-length': String(MAX_IMPORT_BYTES + 1) } }));
    await expect(fetchRecipePage('https://example.com')).rejects.toMatchObject({ code: 'IMP-2006' });
  });
});
