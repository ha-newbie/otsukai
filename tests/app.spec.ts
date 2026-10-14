import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dateLabel, localDate } from '../src/domain/dates';
const appPath = process.env.BASE_PATH ?? '/';

async function tab(page: Page, name: string) { await page.getByRole('navigation').getByRole('button', { name, exact: true }).click(); }
async function recipe(page: Page, title = 'にんじんスープ') {
  await tab(page, 'レシピ');
  await page.getByRole('button', { name: 'レシピを追加', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'レシピを登録' });
  await form.getByLabel('料理名').fill(title);
  await form.getByLabel('材料1の食材名').fill('にんじん');
  await form.getByLabel('材料1の数量').fill('400');
  await form.getByLabel('材料1の単位').selectOption('g');
  await form.getByRole('button', { name: 'レシピを保存', exact: true }).click();
  await expect(form).not.toBeVisible();
}
async function meal(page: Page) {
  await tab(page, '献立');
  await page.getByRole('button', { name: `${dateLabel(localDate())}の夜にレシピ追加`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '献立に追加する', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
test('レシピ → 献立 → 在庫差引 → 買い物 → 購入反映 → バックアップ復元', async ({ page }) => {
  await page.goto(appPath);
  await recipe(page);
  await meal(page);
  await tab(page, '在庫');
  await page.getByRole('button', { name: '在庫を追加', exact: true }).click();
  const stock = page.getByRole('dialog', { name: '在庫を登録' });
  await stock.getByLabel('食材名', { exact: true }).fill('にんじん');
  await stock.getByLabel('在庫の数量').fill('100');
  await stock.getByRole('combobox', { name: '単位', exact: true }).selectOption('g');
  await stock.getByRole('button', { name: '在庫を保存' }).click();
  await expect(stock).not.toBeVisible();
  await tab(page, '献立');
  await page.getByRole('button', { name: '買い物リストを作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '買い物リスト', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'にんじんの購入数量を調整' })).toHaveText('300 g');
  await page.getByRole('button', { name: 'にんじんの購入数量を調整' }).click();
  await page.getByRole('dialog').getByLabel('購入量（g）').fill('500');
  await page.getByRole('dialog').getByRole('button', { name: '数量を保存' }).click();
  await page.getByRole('button', { name: '品目を追加' }).click();
  const manual = page.getByRole('dialog', { name: '買うものを追加' });
  await manual.getByLabel('食材名', { exact: true }).fill('牛乳');
  await manual.getByRole('combobox', { name: '単位', exact: true }).selectOption('L');
  await manual.getByRole('combobox', { name: 'カテゴリ', exact: true }).selectOption('dairy');
  await manual.getByRole('button', { name: 'リストに追加', exact: true }).click();
  await page.getByRole('checkbox', { name: 'にんじんを購入チェック' }).click();
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeChecked();
  await page.getByRole('checkbox', { name: '牛乳を購入チェック' }).click();
  await expect(page.getByRole('checkbox', { name: '牛乳を購入チェック' })).toBeChecked();
  await page.reload();
  await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '牛乳を購入チェック' })).toBeChecked();
  await tab(page, 'レシピ');
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'にんじんスープ' }) }).click();
  await page.getByRole('button', { name: '編集する', exact: true }).click();
  await page.getByLabel('材料1の数量').fill('900');
  await page.getByRole('button', { name: 'レシピを保存', exact: true }).click();
  await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'にんじんの購入数量を調整' })).toHaveText('500 g');
  await expect(page.getByRole('button', { name: '献立から再集計', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '買い物を完了して在庫に反映' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '実行する', exact: true }).click();
  await expect(page.getByRole('heading', { name: '買い物完了', exact: true })).toBeVisible();
  await tab(page, '在庫');
  await expect(page.getByRole('button', { name: 'にんじんの在庫を編集' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '牛乳の在庫を編集' })).toHaveCount(1);
  await tab(page, '設定');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ダウンロード保存', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const buffer = await readFile(path!);
  const saved = JSON.parse(buffer.toString()) as { schemaVersion: number; data: { pantry: unknown[]; shoppingItems: { checked: boolean }[] } };
  expect(saved.schemaVersion).toBe(1); expect(saved.data.pantry).toHaveLength(3);
  expect(saved.data.shoppingItems.every(item => item.checked)).toBe(true);
  await tab(page, 'レシピ');
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'にんじんスープ' }) }).click();
  await page.getByRole('button', { name: '削除する', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あなたの定番を、ここに。' })).toBeVisible();
  await tab(page, '設定');
  await page.getByLabel('復元するバックアップファイル').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer });
  const restore = page.getByRole('dialog', { name: 'このバックアップを復元しますか？' });
  await expect(restore).toContainText('レシピ 1件');
  await restore.getByRole('button', { name: '実行する', exact: true }).click();
  await expect(restore).not.toBeVisible();
  await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: 'にんじんスープ', exact: true })).toBeVisible();
});

test('production PWAはオフライン再読込・オフライン編集を保存できる', async ({ page, context }) => {
  await page.goto(appPath);
  await recipe(page, 'オフラインスープ');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '一週間の献立' })).toBeVisible();
  await expect(page.getByText('オフライン', { exact: true })).toBeVisible();
  await recipe(page, 'オフラインで追加');
  await page.reload();
  await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: 'オフラインで追加', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('不正なバックアップは復元前に拒否し、既存レシピを残す', async ({ page }) => {
  await page.goto(appPath); await recipe(page);
  await tab(page, '設定');
  await page.getByLabel('復元するバックアップファイル').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":999}') });
  await expect(page.getByRole('alert')).toContainText('対応する形式');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await tab(page, 'レシピ'); await expect(page.getByRole('heading', { name: 'にんじんスープ' })).toBeVisible();
});

test('レシピ人数換算・食材検索とモバイル幅のレイアウト', async ({ page }) => {
  await page.goto(appPath); await recipe(page);
  await page.getByLabel('レシピを検索').fill('にんじん');
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'にんじんスープ' }) }).click();
  await page.getByLabel('換算する人数').fill('4');
  await expect(page.getByRole('dialog')).toContainText('800 g');
  await page.screenshot({ path: 'test-results/recipe-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  for (const name of ['献立', '買い物', '在庫', '設定', 'レシピ']) {
    await tab(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.visualViewport!.width)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await tab(page, '献立');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/plan-desktop.png', fullPage: true });
});

test('ChatGPTのレシピJSONを検証・確認して取り込む', async ({ page }) => {
  await page.goto(appPath);
  await tab(page, 'レシピ');
  await page.getByRole('button', { name: '手動で取り込む →', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'ChatGPTから手動取込' });
  await dialog.getByLabel('回答のレシピJSON').fill('{');
  await dialog.getByRole('button', { name: 'JSONを検証する' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('回答のレシピJSON').fill(JSON.stringify({ title: 'かんたんスープ', servings: 2, ingredients: [{ name: 'にんじん', quantity: 200, unit: 'g', categoryId: 'vegetable' }], steps: '', source: '', sourceUrl: '' }));
  await dialog.getByRole('button', { name: 'JSONを検証する' }).click();
  await expect(dialog.getByRole('heading', { name: 'かんたんスープ（2人分）' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'かんたんスープ', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'かんたんスープ', exact: true })).toBeVisible();
});

test('Pagesの初回404 URLでも起動し、同じURLをオフラインで再読込できる', async ({ page, context }) => {
  const directPath = `${appPath}shared/menu?week=2026-10-12#details`;
  const response = await page.goto(directPath);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '一週間の献立', exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp('shared/menu\\?week=2026-10-12#details$'));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  const registration = await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    return { scope: new URL(worker.scope).pathname, script: new URL(worker.active!.scriptURL).pathname };
  });
  expect(registration).toEqual({ scope: appPath, script: `${appPath}sw.js` });
  await recipe(page, '直接URLで保存');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '一週間の献立', exact: true })).toBeVisible();
  await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: '直接URLで保存', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('ホーム画面用manifestとiOSアイコンがアプリのbase内で取得できる', async ({ page, request }) => {
  await page.goto(appPath);
  const manifestURL = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestURL).toBe(`${appPath}manifest.webmanifest`);
  const response = await request.get(manifestURL!);
  expect(response.status()).toBe(200);
  const manifest = await response.json() as { id: string; start_url: string; scope: string; display: string; icons: { src: string }[] };
  expect(manifest).toMatchObject({ id: appPath, start_url: appPath, scope: appPath, display: 'standalone' });
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith(appPath)).toBe(true);
    const file = await request.get(icon.src);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('image/png');
  }
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(touchIcon).toBe(`${appPath}apple-touch-icon.png`);
  expect((await request.get(touchIcon!)).status()).toBe(200);
});
