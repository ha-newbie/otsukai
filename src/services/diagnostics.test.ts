import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../domain/errors';
import { describeError, diagnosticText, safeDiagnosticUrl } from './diagnostics';

afterEach(() => vi.unstubAllGlobals());
it('コード・処理段階・観測したHTTP状態・ビルドを診断に残す', () => {
  vi.stubGlobal('navigator', { onLine: true });
  const report = describeError(new AppError('IMP-2004', { url: 'https://cookpad.com/jp/recipes/18472521?token=secret#private', httpStatus: 403 }));
  expect(report).toMatchObject({ code: 'IMP-2004', phase: 'URL取得', online: true, context: { url: 'https://cookpad.com/jp/recipes/18472521', httpStatus: 403 } });
  expect(report.build).toMatch(/^(?:local|[a-f0-9]{12})$/);
  expect(diagnosticText(report)).not.toMatch(/secret|private|token=/);
});
it('不確定な通信エラーでCORSやHTTP状態を断定せず、入力内容をコピーしない', () => {
  const report = describeError(new AppError('IMP-2003', {}, 'private input text'));
  expect(report.help).toContain('断定できません');
  expect(report.context.httpStatus).toBeUndefined();
  expect(diagnosticText(report)).not.toContain('private input text');
  expect(safeDiagnosticUrl('https://user:password@example.com/path?secret=x#fragment')).toBe('https://example.com/path');
});
it('入力検証・容量不足・予期しない操作失敗を別コードにする', () => {
  const invalid = z.string().safeParse(1);
  expect(describeError(invalid.error).code).toBe('DATA-1001');
  expect(describeError(new DOMException('full', 'QuotaExceededError')).code).toBe('DATA-2001');
  expect(describeError(new Error('failure')).code).toBe('APP-9001');
});
