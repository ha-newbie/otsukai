import { importSourceUrl, MAX_IMPORT_BYTES } from '../domain/recipe-import';

/** Ordinary CORS fetch only. No proxy, cookies, opaque responses or redirects. */
export async function fetchRecipePage(value: string): Promise<string> {
  const url = importSourceUrl(value);
  if (!url || new URL(url).protocol !== 'https:') throw new Error('URLから取得する場合はhttpsのURLを入力してください');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`ページを取得できませんでした（HTTP ${response.status}）。本文の貼り付けをお試しください`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^(?:text\/html|application\/(?:xhtml\+xml|(?:ld\+)?json))(?:;|$)/i.test(contentType)) throw new Error('HTML・JSON以外のファイルは取り込めません');
    if (Number(response.headers.get('content-length')) > MAX_IMPORT_BYTES) throw new Error('ページは2MB以下にしてください');
    if (!response.body) throw new Error('ページの本文がありません');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_IMPORT_BYTES) throw new Error('ページは2MB以下にしてください');
        chunks.push(part.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] ?? 'utf-8';
    try { return new TextDecoder(charset).decode(body); } catch { throw new Error('このページの文字コードに対応していません。本文を貼り付けてください'); }
  } catch (error) {
    if (timedOut) throw new Error('取得が12秒でタイムアウトしました。本文の貼り付けをお試しください');
    if (error instanceof TypeError) throw new Error('ブラウザから取得できませんでした。CORS・転送・通信状態などの制限があります。本文やHTMLを貼り付けて取り込めます');
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}
