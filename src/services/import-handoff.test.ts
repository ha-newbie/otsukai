import { expect, it, vi } from 'vitest';
import { consumePageHandoff, decodePageHandoff, encodePageHandoff, MAX_HANDOFF_URL_LENGTH, sharedCaptureText } from './import-handoff';

const appUrl = 'https://ha-newbie.github.io/otsukai/';
const payload = JSON.stringify({ kind: 'otsukai-recipe-page', version: 1, recipe: { name: '醤油と野菜 🍆', url: 'https://cookpad.com/jp/recipes/18472521' } });

it('日本語を端末内のfragmentで受け渡し、queryへ材料を含めない', () => {
  const link = encodePageHandoff(payload, appUrl + '?old=1#previous');
  const url = new URL(link);
  expect(url.origin + url.pathname + url.search).toBe(appUrl);
  expect(decodePageHandoff(link, appUrl)).toBe(payload);
  expect(sharedCaptureText(link, appUrl)).toBe(payload);
  expect(sharedCaptureText(`  ${payload}\n`, appUrl)).toBe(payload);
});

it('別オリジン・別アプリ・認証情報・query付きの受渡しを拒否する', () => {
  const link = encodePageHandoff(payload, appUrl);
  for (const input of [
    link.replace('ha-newbie.github.io', 'evil.test'),
    link.replace('/otsukai/', '/another-app/'),
    link.replace('https://', 'https://user:pass@'),
    link.replace('/otsukai/#', '/otsukai/?data=private#'),
  ]) expect(() => decodePageHandoff(input, appUrl)).toThrow(expect.objectContaining({ code: 'IMP-4006' }));
});

it('未知の版・壊れたbase64・不正UTF-8を受け入れない', () => {
  for (const fragment of ['v2.e30', 'v1.a', 'v1.%%%25', 'v1._w', 'v1.', 'v1.e30&other=x']) {
    expect(() => decodePageHandoff(`${appUrl}#otsukai-import=${fragment}`, appUrl)).toThrow(expect.objectContaining({ code: 'IMP-4006' }));
  }
});

it('長すぎるリンクは受信前に明確なコードで拒否する', () => {
  expect(() => encodePageHandoff('a'.repeat(MAX_HANDOFF_URL_LENGTH), appUrl)).toThrow(RangeError);
  expect(() => decodePageHandoff('a'.repeat(MAX_HANDOFF_URL_LENGTH + 1), appUrl)).toThrow(expect.objectContaining({ code: 'IMP-4007' }));
});

it('成功でも失敗でも受渡しfragmentを消し、history stateは保つ', () => {
  const state = { existing: true };
  const history = { state, replaceState: vi.fn() };
  expect(consumePageHandoff({ href: encodePageHandoff(payload, appUrl) }, history, appUrl)).toEqual({ payload });
  expect(history.replaceState).toHaveBeenLastCalledWith(state, '', appUrl);
  expect(consumePageHandoff({ href: `${appUrl}#otsukai-import=broken` }, history, appUrl)?.error?.code).toBe('IMP-4006');
  expect(history.replaceState).toHaveBeenLastCalledWith(state, '', appUrl);
});

it('通常のページURLやアプリの既存hashを書き換えない', () => {
  const history = { state: null, replaceState: vi.fn() };
  expect(consumePageHandoff({ href: `${appUrl}shared/menu?week=2026-10-12#details` }, history, appUrl)).toBeNull();
  expect(history.replaceState).not.toHaveBeenCalled();
});
