import { AppError } from '../domain/errors';

export const MAX_HANDOFF_URL_LENGTH = 16_000;
const handoffPrefix = '#otsukai-import=v1.';
export type ReceivedPageHandoff = { payload: string; error?: never } | { error: AppError; payload?: never } | null;

export function currentAppUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/** Self-contained so the same encoder can run in the user's Safari shortcut. */
export function encodePageHandoff(payload: string, appUrl: string, maximumLength = 16_000): string {
  const url = new URL(appUrl);
  const bytes = new TextEncoder().encode(payload);
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  url.search = '';
  url.hash = `otsukai-import=v1.${encoded}`;
  if (url.href.length > maximumLength) throw new RangeError('The import link is too long');
  return url.href;
}

export function decodePageHandoff(input: string, appUrl: string): string {
  if (input.length > MAX_HANDOFF_URL_LENGTH) throw new AppError('IMP-4007');
  try {
    const url = new URL(input);
    const app = new URL(appUrl);
    if (url.origin !== app.origin || url.pathname !== app.pathname || url.username || url.password || url.search || !url.hash.startsWith(handoffPrefix)) throw new Error('Invalid destination');
    const encoded = url.hash.slice(handoffPrefix.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error('Invalid encoding');
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, value => value.charCodeAt(0)));
  } catch { throw new AppError('IMP-4006'); }
}

/** Accept both the new handoff URL and JSON produced by older shortcuts. */
export function sharedCaptureText(input: string, appUrl: string): string {
  const value = input.trim();
  return /^https?:\/\//i.test(value) ? decodePageHandoff(value, appUrl) : value;
}

/** Remove the fragment before parsing/rendering; it never belongs in diagnostics or a saved recipe URL. */
export function consumePageHandoff(location: Pick<Location, 'href'>, history: Pick<History, 'state' | 'replaceState'>, appUrl: string): ReceivedPageHandoff {
  const url = new URL(location.href);
  if (!url.hash.startsWith('#otsukai-import=')) return null;
  const input = url.href;
  url.hash = '';
  history.replaceState(history.state, '', url.href);
  try { return { payload: decodePageHandoff(input, appUrl) }; }
  catch (cause) { return { error: cause instanceof AppError ? cause : new AppError('IMP-4006') }; }
}
