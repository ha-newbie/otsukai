import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { addDays, dateLabel, localDate, monday } from '../src/domain/dates';
import { defaultCategories } from '../src/domain/models';
import { decodePageHandoff, encodePageHandoff } from '../src/services/import-handoff';
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
  expect(saved.schemaVersion).toBe(2); expect(saved.data.pantry).toHaveLength(3);
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
  await page.getByRole('button', { name: 'レシピを取り込む →', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'レシピを取り込む' });
  await dialog.getByLabel('元レシピのURL').fill('https://recipes.example.test/original');
  await dialog.getByLabel('出典').fill('元の料理サイト');
  await dialog.getByRole('button', { name: '本文・AI', exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'ChatGPTを開く ↗' })).toHaveAttribute('href', 'https://chatgpt.com/');
  await dialog.getByLabel('回答のレシピJSON').fill('{');
  await dialog.getByRole('button', { name: 'JSONを検証する' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('回答のレシピJSON').fill('```json\n' + JSON.stringify({ title: 'かんたんスープ', servings: 2, ingredients: [{ name: 'にんじん', quantity: 200, unit: 'g', categoryId: 'vegetable' }], steps: '', source: 'モデルの出典', sourceUrl: 'https://recipes.example.test/model' }) + '\n```');
  await dialog.getByRole('button', { name: 'JSONを検証する' }).click();
  await expect(dialog.getByRole('heading', { name: 'かんたんスープ（2人分）' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'かんたんスープ', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('元レシピのURL')).toHaveValue('https://recipes.example.test/original');
  await expect(dialog.getByLabel('出典')).toHaveValue('元の料理サイト');
  await dialog.getByLabel('材料1の数量').fill('300');
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'かんたんスープ', exact: true })).toBeVisible();
  await page.reload(); await tab(page, 'レシピ');
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'かんたんスープ', exact: true }) }).click();
  await expect(page.getByRole('dialog')).toContainText('300 g');
  await expect(page.getByRole('link', { name: '元レシピを見る ↗' })).toHaveAttribute('href', 'https://recipes.example.test/original');
});

const structuredRecipes = { '@graph': [
  { '@type': 'Recipe', name: '読込スープ', recipeYield: '2人分', recipeIngredient: ['にんじん 200g', '牛乳 1カップ'], recipeInstructions: [{ '@type': 'HowToStep', text: '煮る。' }] },
  { '@type': 'Recipe', name: '卵のメモ', recipeYield: '2人分', recipeIngredient: ['卵 1個'] },
] };
async function openImport(page: Page) {
  await tab(page, 'レシピ');
  await page.getByRole('button', { name: 'レシピを取り込む →', exact: true }).click();
  return page.getByRole('dialog', { name: 'レシピを取り込む' });
}

test('HTMLをオフラインで解析し、複数候補から編集・保存して献立に使える', async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('recipes.example.test')) externalRequests.push(request.url()); });
  await page.goto(appPath);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  await context.setOffline(true);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill('https://recipes.example.test/page');
  await dialog.getByRole('button', { name: 'HTML・JSON', exact: true }).click();
  const html = `<script>window.importExecuted=true</script><img src="https://recipes.example.test/tracker"><script type="application/ld+json">${JSON.stringify(structuredRecipes)}</script>`;
  await dialog.getByLabel('取り込むHTML・JSONファイル').setInputFiles({ name: 'recipe.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect(dialog).toContainText('牛乳 1カップ');
  await expect(dialog.getByLabel('材料2の単位')).toHaveValue('適量');
  await expect(page.getByRole('heading', { name: '読込スープ', exact: true })).toHaveCount(0);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/import-mobile.png' });
  expect(await page.evaluate(() => 'importExecuted' in window)).toBe(false);
  expect(externalRequests).toEqual([]);
  await dialog.getByLabel('取り込むレシピ').selectOption('1');
  await dialog.getByLabel('材料1の数量').fill('2');
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await meal(page);
  await page.getByRole('button', { name: '買い物リストを作成', exact: true }).click();
  await expect(page.getByRole('button', { name: '卵の購入数量を調整' })).toHaveText('2個');
  await page.reload(); await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: '卵のメモ', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('URL取込はCORSで取得した構造化データを確認して保存する', async ({ page }) => {
  await page.route('https://recipes.example.test/page', route => route.fulfill({ status: 200, contentType: 'application/ld+json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(structuredRecipes) }));
  await page.goto(appPath);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill('https://recipes.example.test/page');
  await dialog.getByRole('button', { name: 'URLから取得する' }).click();
  await expect(dialog.getByRole('heading', { name: '読込スープ（2人分）' })).toBeVisible();
  await expect(dialog.getByLabel('元レシピのURL')).toHaveValue('https://recipes.example.test/page');
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '読込スープ', exact: true })).toBeVisible();
});

test('URL取得に失敗しても保存せず、本文・AIの方法へ切り替えられる', async ({ page }) => {
  await page.route('https://recipes.example.test/blocked', route => route.abort('failed'));
  await page.goto(appPath);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill('https://recipes.example.test/blocked');
  await dialog.getByRole('button', { name: 'URLから取得する' }).click();
  await expect(dialog.getByRole('alert')).toContainText('IMP-2003');
  await expect(dialog.getByRole('button', { name: 'この内容で保存する' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '本文・AI', exact: true }).click();
  await dialog.getByLabel('整理したいレシピの本文').fill('材料: にんじん200g。2人分。煮る。');
  await dialog.getByText('プロンプトを表示', { exact: true }).click();
  await expect(dialog.getByLabel('コピー用プロンプト')).toHaveValue(/recipes.example.test\/blocked/);
  await expect(dialog.getByLabel('コピー用プロンプト')).toHaveValue(/にんじん200g/);
  await expect(dialog).toContainText('Sign in with ChatGPTは未対応');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あなたの定番を、ここに。' })).toBeVisible();
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

test('クックパッドのHTMLから材料だけを抽出し、調味料を保存して買い物から除外する', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('cookpad.example.test')) requests.push(request.url()); });
  await page.goto(appPath);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  await context.setOffline(true);
  const dialog = await openImport(page);
  await expect(dialog.getByLabel('材料だけを取り込む（作り方は保存しない）')).toBeChecked();
  await dialog.getByRole('button', { name: 'HTML・JSON', exact: true }).click();
  await dialog.getByLabel('取り込むHTML・JSONファイル').setInputFiles('tests/fixtures/cookpad-ingredients.html');
  await expect(dialog.getByLabel('料理名', { exact: true })).toHaveValue('取込テストの野菜煮');
  await expect(dialog.getByLabel('材料2の食材名')).toHaveValue('しょうゆ');
  await expect(dialog.getByLabel('材料2の数量')).toHaveValue('0.5');
  await expect(dialog.getByLabel('材料2のカテゴリ')).toHaveValue('seasoning');
  await expect(dialog.getByLabel('材料3の食材名')).toHaveValue('塩');
  await expect(dialog.getByLabel('材料4の食材名')).toHaveValue('ご飯');
  await expect(dialog.getByLabel('作り方')).toHaveValue('');
  await expect(dialog.getByLabel('出典')).toHaveValue('クックパッド / テスト作者');
  await expect(dialog.getByLabel('元レシピのURL')).toHaveValue('https://cookpad.com/jp/recipes/999000001');
  await expect(dialog.getByLabel('材料5の食材名')).toHaveCount(0);
  expect(await page.evaluate(() => 'cookpadImportExecuted' in window)).toBe(false);
  expect(requests).toEqual([]);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/cookpad-import-mobile.png' });
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await meal(page);
  await page.getByRole('button', { name: '買い物リストを作成', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'しょうゆを購入チェック' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '塩を購入チェック' })).toHaveCount(0);
  await tab(page, '設定');
  const exclusion = page.getByRole('checkbox', { name: '調味料を買い物集計から除外' });
  await expect(exclusion).toBeChecked();
  await exclusion.click(); await expect(exclusion).not.toBeChecked();
  await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: 'しょうゆを購入チェック' })).toHaveCount(0);
  await page.getByRole('button', { name: '献立から再集計', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'しょうゆを購入チェック' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '塩を購入チェック' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'にんじんを購入チェック' }).click();
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeChecked();
  await tab(page, '設定');
  await exclusion.click(); await expect(exclusion).toBeChecked();
  await page.getByText('登録済み食材のカテゴリを変更', { exact: true }).click();
  await page.getByLabel('にんじんの共通カテゴリ').selectOption('vegetable');
  await expect(page.getByLabel('にんじんの共通カテゴリ')).toHaveValue('vegetable');
  await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: 'しょうゆを購入チェック' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'にんじんの購入数量を調整' })).toHaveText('200 g');
  await page.reload(); await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: 'にんじんを購入チェック' })).toBeChecked();
  await tab(page, 'レシピ');
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: '取込テストの野菜煮', exact: true }) }).click();
  await expect(page.getByRole('dialog')).toContainText('しょうゆ');
  await expect(page.getByRole('dialog')).toContainText('材料だけのレシピです。');
  await context.setOffline(false);
});

test('クックパッドの材料欄がない・壊れているHTMLを誤って保存しない', async ({ page }) => {
  await page.goto(appPath);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill('https://cookpad.com/jp/recipes/999000001');
  await dialog.getByRole('button', { name: 'HTML・JSON', exact: true }).click();
  for (const html of ['<h1>ログイン画面</h1><p>材料はありません</p>', '<h1>材料が欠落</h1><section id="ingredients"><li id="ingredient_1"><bdi>100g</bdi></li></section>']) {
    await dialog.getByLabel('HTML・構造化JSON', { exact: true }).fill(html);
    await dialog.getByRole('button', { name: '構造化データを解析する' }).click();
    await expect(dialog.getByRole('alert')).toContainText('材料');
    await expect(dialog.getByRole('button', { name: 'この内容で保存する' })).toHaveCount(0);
  }
  await dialog.getByLabel('元レシピのURL').fill('https://cookpad.com/jp/recipes/999000001-test');
  await dialog.getByLabel('HTML・構造化JSON', { exact: true }).fill('<h1>材料だけの断片</h1><section id="ingredients"><li id="ingredient_1"><span>塩</span><bdi>適量</bdi></li></section>');
  await dialog.getByRole('button', { name: '構造化データを解析する' }).click();
  await expect(dialog.getByLabel('料理名', { exact: true })).toHaveValue('材料だけの断片');
  await expect(dialog.getByLabel('材料1のカテゴリ')).toHaveValue('seasoning');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あなたの定番を、ここに。' })).toBeVisible();
});

test('v1バックアップを復元しても、除外対象の調味料の購入チェックを保護する', async ({ page }) => {
  const start = monday();
  const legacy = { app: 'kosaji', schemaVersion: 1, exportedAt: new Date().toISOString(), data: {
    categories: defaultCategories, ingredients: [{ id: 'salt', name: '塩', normalizedName: '塩', categoryId: 'seasoning' }], recipes: [], meals: [], days: [],
    pantry: [{ id: 'stock', ingredientId: 'salt', quantity: 10, unit: 'g', expiresOn: '' }],
    trips: [{ id: 'trip', startsOn: start, endsOn: addDays(start, 6), status: 'active', createdAt: new Date().toISOString(), mealIds: [] }],
    shoppingItems: [{ id: 'item', ingredientId: 'salt', tripId: 'trip', quantity: 2, unit: 'g', plannedQuantity: 2, pantryQuantity: 0, quantityOverride: null, checked: true, source: 'plan' }],
    settings: [{ id: 'app', defaultServings: 2, lastBackupAt: '', backupReminderDays: 7 }],
  } };
  await page.goto(appPath); await tab(page, '設定');
  await page.getByLabel('復元するバックアップファイル').setInputFiles({ name: 'legacy-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.getByRole('dialog').getByRole('button', { name: '実行する', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('checkbox', { name: '調味料を買い物集計から除外' })).toBeChecked();
  await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: '塩を購入チェック' })).toBeChecked();
  await expect(page.getByRole('button', { name: '塩の購入数量を調整' })).toHaveText('2 g');
  await page.reload(); await tab(page, '買い物');
  await expect(page.getByRole('checkbox', { name: '塩を購入チェック' })).toBeChecked();
});

test('指定Cookpad URLのCORS読取不可をコードで示し、実行手順と匿名の診断を表示する', async ({ page }) => {
  const url = 'https://cookpad.com/jp/recipes/18472521';
  // Simulate the unreadable response; actual browser CORS is checked against a second local origin below.
  await page.route(url, route => route.abort('failed'));
  await page.goto(appPath);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill(url);
  await expect(dialog).toContainText('URL入力だけの自動取得には対応していません');
  await dialog.getByRole('button', { name: '直接取得を試す（診断用）' }).click();
  await expect(dialog.getByRole('alert')).toContainText('IMP-2003');
  await dialog.getByRole('alert').getByText('診断情報', { exact: true }).click();
  const report = JSON.parse(await dialog.getByLabel('診断情報', { exact: true }).inputValue());
  expect(report).toMatchObject({ app: 'otsukai', code: 'IMP-2003', phase: 'URL取得', context: { url } });
  expect(report.context.httpStatus).toBeUndefined();
  await expect(dialog.getByRole('button', { name: 'この内容で保存する' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Safariでの取込手順を開く' }).click();
  await expect(dialog.getByRole('link', { name: '元ページを開く ↗' })).toHaveAttribute('href', url);
  await dialog.getByText('初回だけ：ショートカットの作り方', { exact: true }).click();
  await expect(dialog.getByLabel('Safariショートカット用コード')).toHaveValue(/completion\(link\)/);
});

test('配布するSafari用コードを元ページで実行し、結果をPWAで検証・確認・保存する', async ({ page, context }) => {
  const url = 'https://cookpad.com/jp/recipes/999000001';
  const html = (await readFile('tests/fixtures/cookpad-ingredients.html', 'utf-8')).replace('●（A）しょうゆ', '◯しょうゆ');
  await page.goto(appPath);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill(url);
  await dialog.getByRole('button', { name: 'Safariでの取込手順を開く' }).click();
  await dialog.getByText('初回だけ：ショートカットの作り方', { exact: true }).click();
  await dialog.getByRole('radio', { name: 'ホーム画面版へコピー' }).check();
  const script = await dialog.getByLabel('Safariショートカット用コード').inputValue();
  const source = await context.newPage();
  await source.route('**/*', route => route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.abort());
  await source.goto(url);
  await source.waitForLoadState('networkidle');
  let requests = 0;
  source.on('request', () => requests++);
  const result = await source.evaluate(code => {
    const state = window as Window & { completion?: (value: string) => void };
    let output = ''; let completions = 0;
    state.completion = value => { output = value; completions++; };
    const before = document.documentElement.outerHTML;
    new Function(code)();
    return { output, completions, unchanged: before === document.documentElement.outerHTML };
  }, script);
  expect(result.completions).toBe(1); expect(result.unchanged).toBe(true); expect(requests).toBe(0);
  await source.close();
  await dialog.getByLabel('ページで取得したデータ').fill('not json');
  await dialog.getByRole('button', { name: 'ページの材料を解析する' }).click();
  await expect(dialog.getByRole('alert')).toContainText('IMP-4002');
  await dialog.getByLabel('ページで取得したデータ').fill(result.output);
  await dialog.getByRole('button', { name: 'ページの材料を解析する' }).click();
  await expect(dialog.getByLabel('料理名', { exact: true })).toHaveValue('取込テストの野菜煮');
  await expect(dialog.getByLabel('材料2の食材名')).toHaveValue('しょうゆ');
  await expect(dialog.getByLabel('材料2のカテゴリ')).toHaveValue('seasoning');
  await expect(dialog.getByLabel('作り方')).toHaveValue('');
  await expect(dialog.getByLabel('元レシピのURL')).toHaveValue(url);
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload(); await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: '取込テストの野菜煮', exact: true })).toBeVisible();
});

test('実際の別オリジンでHTTP 200のCORS拒否・許可と通常の転送を検証する', async ({ page }) => {
  await page.goto(appPath);
  const result = await page.evaluate(async () => {
    let unreadable = false;
    try { await fetch('http://127.0.0.1:4181/denied', { mode: 'cors', credentials: 'omit' }); } catch (error) { unreadable = error instanceof TypeError; }
    const response = await fetch('http://127.0.0.1:4181/redirect', { mode: 'cors', credentials: 'omit', redirect: 'follow' });
    return { unreadable, status: response.status, redirected: response.redirected, url: response.url, data: await response.json() };
  });
  expect(result).toEqual({ unreadable: true, status: 200, redirected: true, url: 'http://127.0.0.1:4181/allowed', data: { ok: true } });
});

test('HTTP拒否とHTTP成功後の材料解析エラーを区別し、URLのクエリを診断へ残さない', async ({ page }) => {
  await page.goto(appPath);
  const dialog = await openImport(page);
  const cases = [
    { url: 'https://recipes.example.test/forbidden?private=secret#fragment', status: 403, body: 'denied', code: 'IMP-2004', phase: 'URL取得' },
    { url: 'https://cookpad.com/jp/recipes/18472521?private=secret#fragment', status: 200, body: '<h1>材料がない画面</h1>', code: 'IMP-3002', phase: 'URL応答のレシピ解析' },
  ];
  for (const item of cases) {
    await page.route(item.url.split('#')[0]!, route => route.fulfill({ status: item.status, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: item.body }));
    await dialog.getByLabel('元レシピのURL').fill(item.url);
    await dialog.getByRole('button', { name: item.url.includes('cookpad.com') ? '直接取得を試す（診断用）' : 'URLから取得する' }).click();
    await expect(dialog.getByRole('alert')).toContainText(item.code);
    await dialog.getByRole('alert').getByText('診断情報', { exact: true }).click();
    const diagnostic = await dialog.getByLabel('診断情報', { exact: true }).inputValue();
    expect(diagnostic).not.toMatch(/private|secret|fragment/);
    expect(JSON.parse(diagnostic)).toMatchObject({ code: item.code, phase: item.phase });
    expect(JSON.parse(diagnostic).context.httpStatus).toBe(item.status);
  }
});

test('端末DBを開けない場合にも読込段階のエラーコードを表示する', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(IDBFactory.prototype, 'open', { value() { throw new DOMException('blocked for this test', 'SecurityError'); } }); });
  await page.goto(appPath);
  await expect(page.getByRole('alert')).toContainText('DATA-2002');
  await expect(page.getByRole('button', { name: '再読み込み', exact: true })).toBeVisible();
});

test('共有用の本番コードが生成したリンクからオフラインでも自動解析し、確認後だけ保存する', async ({ page, context }) => {
  const url = 'https://cookpad.com/jp/recipes/999000001';
  await page.goto(appPath);
  const appUrl = page.url();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20000 }).toBe(true);
  const dialog = await openImport(page);
  await dialog.getByLabel('元レシピのURL').fill(url);
  await dialog.getByRole('button', { name: 'Safariでの取込手順を開く' }).click();
  await dialog.getByText('初回だけ：ショートカットの作り方', { exact: true }).click();
  const script = await dialog.getByLabel('Safariショートカット用コード').inputValue();
  const source = await context.newPage();
  const html = await readFile('tests/fixtures/cookpad-ingredients.html', 'utf-8');
  await source.route('**/*', route => route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.abort());
  await source.goto(url); await source.waitForLoadState('networkidle');
  let sourceRequests = 0;
  source.on('request', () => sourceRequests++);
  const result = await source.evaluate(code => {
    let output = ''; let completions = 0;
    (window as Window & { completion?: (value: string) => void }).completion = value => { output = value; completions++; };
    const before = document.documentElement.outerHTML;
    new Function(code)();
    return { output, completions, unchanged: before === document.documentElement.outerHTML };
  }, script);
  expect(result.completions).toBe(1); expect(result.unchanged).toBe(true); expect(sourceRequests).toBe(0);
  expect(JSON.parse(decodePageHandoff(result.output, appUrl)).recipe.recipeIngredient).toHaveLength(4);
  const tooLong = await source.evaluate(code => {
    document.querySelector('#ingredient_1 > span')!.textContent = '長い材料名'.repeat(1500);
    let output = '';
    (window as Window & { completion?: (value: string) => void }).completion = value => { output = value; };
    new Function(code)(); return output;
  }, script);
  expect(JSON.parse(decodePageHandoff(tooLong, appUrl)).error.code).toBe('IMP-4007');
  await source.close();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  // Model a new browser navigation from Shortcuts. An open form deliberately queues a hash-only handoff.
  await page.goto('about:blank');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await page.goto(result.output);
  await expect(page).toHaveURL(appUrl);
  await expect(dialog.getByLabel('料理名', { exact: true })).toHaveValue('取込テストの野菜煮');
  await expect(dialog.getByLabel('材料2のカテゴリ')).toHaveValue('seasoning');
  await expect(dialog).toContainText('ホーム画面のおつかい');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あなたの定番を、ここに。' })).toBeVisible();
  await page.goto(result.output);
  await expect(dialog.getByLabel('元レシピのURL')).toHaveValue(url);
  await expect(dialog.getByLabel('作り方')).toHaveValue('');
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload(); await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: '取込テストの野菜煮', exact: true })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(requests.every(value => !value.includes('otsukai-import') && !value.includes('cookpad.com'))).toBe(true);
  await context.setOffline(false);
});

const sharedRecipe = { kind: 'otsukai-recipe-page', version: 1, recipe: { '@type': 'Recipe', name: '共有からのスープ', url: 'https://cookpad.com/jp/recipes/999000002', recipeYield: '2人分', recipeIngredient: [{ '@type': 'PropertyValue', name: 'にんじん', value: '200g' }], publisher: { name: 'クックパッド' } } };
for (const format of ['link', 'json'] as const) test(`ホーム画面版の受取入口は${format}を1操作で解析し、起動時はクリップボードを読まない`, async ({ page, baseURL }) => {
  const payload = JSON.stringify(sharedRecipe);
  const input = format === 'link' ? encodePageHandoff(payload, new URL(appPath, baseURL).href) : payload;
  await page.addInitScript(value => {
    const state = window as Window & { clipboardReads?: number };
    state.clipboardReads = 0;
    Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => { state.clipboardReads = (state.clipboardReads ?? 0) + 1; return value; } } });
  }, input);
  await page.goto(appPath); await tab(page, 'レシピ');
  expect(await page.evaluate(() => (window as Window & { clipboardReads?: number }).clipboardReads)).toBe(0);
  await page.getByRole('button', { name: '共有した材料を取り込む', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('料理名', { exact: true })).toHaveValue('共有からのスープ');
  expect(await page.evaluate(() => (window as Window & { clipboardReads?: number }).clipboardReads)).toBe(1);
  await dialog.getByRole('button', { name: 'この内容で保存する' }).click();
  // The click dispatches an asynchronous IndexedDB transaction; wait for its committed UI result.
  await expect(page.getByRole('status')).toContainText('レシピを取り込みました');
  await expect(dialog).not.toBeVisible();
  await page.reload(); await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: '共有からのスープ', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { clipboardReads?: number }).clipboardReads)).toBe(0);
});

test('不正な受渡しをコードで拒否してURLから消し、既存レシピを保護する', async ({ page }) => {
  await page.goto(appPath); const appUrl = page.url();
  await recipe(page, '既存の料理');
  await page.goto(appUrl + '#otsukai-import=broken');
  await expect(page.getByRole('alert')).toContainText('IMP-4006');
  await expect(page).toHaveURL(appUrl);
  await tab(page, 'レシピ');
  await expect(page.getByRole('heading', { name: '既存の料理', exact: true })).toBeVisible();
  const invalid = { ...sharedRecipe, recipe: { ...sharedRecipe.recipe, url: 'https://cookpad.com.evil.test/jp/recipes/999000002' } };
  await page.goto(encodePageHandoff(JSON.stringify(invalid), appUrl));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('IMP-4002');
  await expect(dialog.getByRole('button', { name: 'この内容で保存する' })).toHaveCount(0);
  await expect(page).toHaveURL(appUrl);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('heading', { name: '既存の料理', exact: true })).toBeVisible();
});

test('編集中に別の共有リンクが届いても入力を上書きしない', async ({ page }) => {
  await page.goto(appPath); const appUrl = page.url();
  await tab(page, 'レシピ');
  await page.getByRole('button', { name: 'レシピを追加', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('料理名').fill('まだ保存していない料理');
  await page.evaluate(link => { location.hash = new URL(link).hash; }, encodePageHandoff(JSON.stringify(sharedRecipe), appUrl));
  await expect(page).toHaveURL(appUrl);
  await expect(dialog.getByLabel('料理名')).toHaveValue('まだ保存していない料理');
  await expect(dialog.getByRole('status')).toContainText('共有した材料を受け取りました');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '受け取った材料を確認' }).click();
  await expect(dialog.getByLabel('料理名')).toHaveValue('共有からのスープ');
});

test('クリップボードAPIがなくても手動の貼付操作で材料を自動解析する', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.goto(appPath);
  const dialog = await openImport(page);
  await dialog.getByRole('button', { name: 'ページ取込', exact: true }).click();
  await dialog.getByRole('button', { name: '共有した材料を取り込む' }).click();
  await expect(dialog.getByRole('alert')).toContainText('IMP-4003');
  await dialog.getByLabel('ページで取得したデータ').evaluate((element, input) => {
    const data = new DataTransfer(); data.setData('text/plain', input);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, JSON.stringify(sharedRecipe));
  await expect(dialog.getByLabel('料理名')).toHaveValue('共有からのスープ');
});
