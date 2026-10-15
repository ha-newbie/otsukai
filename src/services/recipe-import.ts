import { importSourceUrl, MAX_IMPORT_BYTES } from '../domain/recipe-import';
import { AppError, type ErrorContext } from '../domain/errors';

/** Runs in the user's browser. Ordinary CORS only; never a proxy or opaque fetch. */
export interface RecipeResponse { content: string; url: string; httpStatus: number; contentType: string; }
export async function fetchRecipeResponse(value: string): Promise<RecipeResponse> {
  const url = importSourceUrl(value);
  if (!url) throw new AppError('IMP-1003', { phase: 'URL入力' });
  if (new URL(url).protocol !== 'https:') throw new AppError('IMP-1002', { url });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AppError('IMP-2001', { url });
  const context: ErrorContext = { url };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', cache: 'no-store', signal: controller.signal });
    context.httpStatus = response.status;
    if (response.url && (!response.url.startsWith('https://') || new URL(response.url).username || new URL(response.url).password)) throw new AppError('IMP-2009', context);
    if (!response.ok) throw new AppError('IMP-2004', context, `元サイトがHTTP ${response.status}を返しました`);
    const contentType = response.headers.get('content-type') ?? '';
    context.contentType = contentType;
    if (!/^(?:text\/html|application\/(?:xhtml\+xml|(?:ld\+)?json))$/i.test(contentType.split(';')[0]?.trim() ?? '')) throw new AppError('IMP-2005', context);
    if (Number(response.headers.get('content-length')) > MAX_IMPORT_BYTES) throw new AppError('IMP-2006', context);
    if (!response.body) throw new AppError('IMP-2007', context);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_IMPORT_BYTES) throw new AppError('IMP-2006', context);
        chunks.push(part.value);
      }
    } finally { try { await reader.cancel(); } catch { /* Cleanup must not replace the original failure. */ } reader.releaseLock(); }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] ?? 'utf-8';
    let content: string;
    try { content = new TextDecoder(charset).decode(body); } catch { throw new AppError('IMP-2008', context); }
    if (!content.trim()) throw new AppError('IMP-2007', context);
    return { content, url: response.url || url, httpStatus: response.status, contentType };
  } catch (error) {
    if (timedOut) throw new AppError('IMP-2002', context);
    if (error instanceof AppError) throw error;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AppError('IMP-2001', context);
    throw new AppError('IMP-2003', context);
  } finally { clearTimeout(timer); controller.abort(); }
}
export async function fetchRecipePage(value: string): Promise<string> { return (await fetchRecipeResponse(value)).content; }
