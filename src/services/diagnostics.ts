import { ZodError } from 'zod';
import { AppError, errorCatalog, type ErrorCode, type ErrorContext } from '../domain/errors';

declare const __APP_BUILD__: string;
export const APP_BUILD = __APP_BUILD__;
export interface ErrorReport { code: ErrorCode; message: string; help: string; phase: string; occurredAt: string; build: string; online: boolean | null; displayMode: string; context: ErrorContext; }
/** Never include URL query/hash/credentials, input HTML, recipe data, cookies or stack traces. */
export function safeDiagnosticUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}${url.pathname}`.slice(0, 2100) : undefined; } catch { return undefined; }
}
export function describeError(cause: unknown): ErrorReport {
  const error = cause instanceof AppError ? cause : cause instanceof ZodError
    ? new AppError('DATA-1001', { field: cause.issues[0]?.path.join('.') }, `入力内容を確認してください：${cause.issues[0]?.message ?? '形式が正しくありません'}`)
    : typeof DOMException !== 'undefined' && cause instanceof DOMException && cause.name === 'QuotaExceededError'
      ? new AppError('DATA-2001') : new AppError('APP-9001', {}, cause instanceof Error ? cause.message : undefined);
  const context: ErrorContext = {
    ...(error.context.url && safeDiagnosticUrl(error.context.url) ? { url: safeDiagnosticUrl(error.context.url) } : {}),
    ...(error.context.httpStatus !== undefined ? { httpStatus: error.context.httpStatus } : {}),
    ...(error.context.contentType ? { contentType: error.context.contentType.slice(0, 120) } : {}),
    ...(error.context.field ? { field: error.context.field.slice(0, 200) } : {}),
  };
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return { code: error.code, message: error.message, help: errorCatalog[error.code][2], phase: error.context.phase ?? errorCatalog[error.code][0], occurredAt: new Date().toISOString(), build: APP_BUILD, online: typeof navigator === 'undefined' ? null : navigator.onLine ?? null, displayMode: standalone ? 'standalone' : 'browser', context };
}
export function diagnosticText(report: ErrorReport): string {
  // The human-facing message can contain user input from other operations; omit it.
  const { message: _message, help: _help, ...diagnostic } = report;
  return JSON.stringify({ app: 'otsukai', ...diagnostic }, null, 2);
}
