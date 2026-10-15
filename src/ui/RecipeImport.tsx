import { useRef, useState, type FormEvent } from 'react';
import type { AppData } from '../domain/models';
import { importSourceUrl, MAX_IMPORT_BYTES, parseAIRecipeAnswer, type ImportedRecipe } from '../domain/recipe-import';
import { manualRecipeSchema, type RecipeInput } from '../domain/recipe-input';
import { repository } from '../persistence/repository';
import { recipePrompt } from '../services/ai';
import { fetchRecipeResponse } from '../services/recipe-import';
import type { ErrorContext } from '../domain/errors';
import { cookpadRecipeUrl, parseRecipeDocument } from '../services/cookpad-import';
import { copyImportText } from '../services/page-capture';
import { AppError } from '../domain/errors';
import { PageCaptureHelp } from './PageCaptureHelp';
import { normalizeName } from '../domain/models';
import { Modal, type Action } from './components';
import { RecipeFields } from './RecipeFields';

type Method = 'url' | 'page' | 'ai' | 'structured';
export function RecipeImport({ data, action, onClose }: { data: AppData; action: Action; onClose: () => void }) {
  const [method, setMethod] = useState<Method>('url');
  const [sourceUrl, setSourceUrl] = useState('');
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [json, setJSON] = useState('');
  const [structured, setStructured] = useState('');
  const [ingredientsOnly, setIngredientsOnly] = useState(true);
  const [candidates, setCandidates] = useState<ImportedRecipe[]>([]);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<RecipeInput | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const context = { sourceUrl, source, defaultServings: data.settings[0]?.defaultServings ?? 2, ingredientsOnly };
  const cookpadUrl = cookpadRecipeUrl(sourceUrl);
  const showCandidates = (values: ImportedRecipe[]) => {
    const currentCategories = new Map(data.ingredients.map(value => [value.normalizedName, value.categoryId]));
    const adjusted = values.map(value => ({ ...value, recipe: { ...value.recipe, ingredients: value.recipe.ingredients.map(item => ({ ...item, categoryId: currentCategories.get(normalizeName(item.name)) ?? item.categoryId })) } }));
    setCandidates(adjusted); setSelected(0); setDraft(adjusted[0]?.recipe ?? null);
  };
  const loadStructured = (input: string, phase = 'HTML・JSON解析', observed: ErrorContext = {}) => {
    try { showCandidates(parseRecipeDocument(input, context)); }
    catch (error) { if (error instanceof AppError) throw new AppError(error.code, { ...error.context, url: sourceUrl || error.context.url, ...observed, phase }, error.message); throw error; }
  };
  const copyPrompt = () => void action(async () => {
    if (!text.trim() && !sourceUrl.trim()) throw new AppError('IMP-1003');
    importSourceUrl(sourceUrl);
    await copyImportText(recipePrompt(text, context));
  }, 'プロンプトをコピーしました。ChatGPTに貼り付けてください');
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (await action(async () => {
      const validated = manualRecipeSchema.parse(draft);
      validated.sourceUrl = importSourceUrl(validated.sourceUrl);
      await repository.saveRecipe(validated);
    }, 'レシピを取り込みました')) onClose();
  };
  const chosen = candidates[selected];
  return <Modal title="レシピを取り込む" onClose={onClose}>
    {draft ? <>
      <button className="text-button" onClick={() => { setDraft(null); setCandidates([]); }}>← 入力に戻る</button>
      {candidates.length > 1 && <label>取り込むレシピ<select value={selected} onChange={event => {
        const index = Number(event.target.value); setSelected(index); setDraft(candidates[index]!.recipe);
      }}>{candidates.map((candidate, index) => <option key={index} value={index}>{candidate.recipe.title}</option>)}</select></label>}
      <div className="import-notice"><h3>{draft.title}（{draft.servings}人分）</h3><p>まだ保存されていません。元レシピと照合し、必要な項目を直して保存してください。</p>
        <p>調味料も保存します。買い物からの除外は「設定」の「買い物の集計」で管理します。登録済み食材のカテゴリ変更も設定で行えます。</p>
        {!!chosen?.warnings.length && <ul>{chosen.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </div>
      {!!chosen?.originalIngredients.length && <details><summary>元の材料表記を確認</summary><ul className="original-ingredients">{chosen.originalIngredients.map((line, index) => <li key={index}>{line}</li>)}</ul>{chosen.originalYield && <p className="help-text">元の分量：{chosen.originalYield}</p>}</details>}
      <form onSubmit={event => void save(event)}><RecipeFields value={draft} onChange={setDraft} categories={data.categories} /><button className="button primary full" type="submit">この内容で保存する</button></form>
    </> : <>
      <p className="subtle">元サイトの利用条件を守り、自分用のレシピとして取り込みます。取得・解析だけでは保存されません。</p>
      <label>元レシピのURL <span className="optional">任意</span><input type="url" maxLength={2000} value={sourceUrl} placeholder="https://…" onChange={event => setSourceUrl(event.target.value)} /></label>
      <label>出典 <span className="optional">任意</span><input maxLength={200} value={source} placeholder="サイト名・作者名" onChange={event => setSource(event.target.value)} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={ingredientsOnly} onChange={event => setIngredientsOnly(event.target.checked)} />材料だけを取り込む（作り方は保存しない）</label>
      <div className="import-methods" role="group" aria-label="取込方法">
        <button aria-pressed={method === 'url'} onClick={() => setMethod('url')}>URL</button><button aria-pressed={method === 'page'} onClick={() => setMethod('page')}>ページ取込</button><button aria-pressed={method === 'ai'} onClick={() => setMethod('ai')}>本文・AI</button><button aria-pressed={method === 'structured'} onClick={() => setMethod('structured')}>HTML・JSON</button>
      </div>
      {method === 'url' && <section>
        <h3>URLから読み込む</h3>{cookpadUrl ? <div className="import-notice"><p><strong>クックパッドはページ取込を使ってください</strong></p><p>元サイトはPWAからの直接読取を許可していません。Safariで開いたページから材料を受け取れます。URL入力だけの自動取得には対応していません。</p><button className="button primary full" onClick={() => setMethod('page')}>Safariでの取込手順を開く</button></div> : <p className="help-text">この端末のブラウザから直接取得します。別サイトからの読取（CORS）を許可しているページに対応しています。取得できない場合は「ページ取込」「HTML・JSON」「本文・AI」を使います。</p>}
        <button className={`button ${cookpadUrl ? 'secondary' : 'primary'} full`} disabled={!sourceUrl.trim()} onClick={() => void action(async () => {
          const response = await fetchRecipeResponse(sourceUrl);
          loadStructured(response.content, 'URL応答のレシピ解析', { url: response.url, httpStatus: response.httpStatus, contentType: response.contentType });
        }, '内容を確認して保存してください')}>{cookpadUrl ? '直接取得を試す（診断用）' : 'URLから取得する'}</button>
        <p className="help-text">オンラインのhttpsページをCookieなしで取得します。通常の転送にもCORS制約内で対応します。元サイトへ通信します。GitHub Pages上でのサーバー取得は行いません。</p>
      </section>}
      {method === 'page' && <PageCaptureHelp context={context} pageUrl={cookpadUrl} action={action} onResult={showCandidates} />}
      {method === 'ai' && <section>
        <h3>ChatGPTで整理する</h3><p className="help-text">① URLや本文を入力 → ② プロンプトをコピーしてChatGPTに貼り付け → ③ 回答のJSONをここに貼り付けます。コピーだけでは外部に送信されません。ChatGPTに貼り付けた内容はChatGPT側で処理されます。</p>
        <label>整理したいレシピの本文<textarea rows={5} maxLength={20000} value={text} placeholder="材料と作り方を貼り付けてください。URLだけでも依頼できます。" onChange={event => setText(event.target.value)} /></label>
        <button className="button secondary full" onClick={copyPrompt}>プロンプトをコピー</button>
        <a className="button secondary full" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPTを開く ↗</a>
        <details><summary>プロンプトを表示</summary><textarea readOnly rows={8} aria-label="コピー用プロンプト" value={recipePrompt(text, context)} /></details>
        <label>回答のレシピJSON<textarea rows={6} maxLength={100000} value={json} placeholder='{"title":"…","servings":2,"ingredients":[…],"steps":"","source":"","sourceUrl":""}' onChange={event => setJSON(event.target.value)} /></label>
        <button className="button primary full" disabled={!json.trim()} onClick={() => void action(async () => showCandidates([parseAIRecipeAnswer(json, context)]), 'JSONを検証しました。内容を確認して保存してください')}>JSONを検証する</button>
        <p className="help-text">このPWAでのSign in with ChatGPTは未対応です。ChatGPT自身へのログインで手動連携でき、APIキーは不要です。</p>
      </section>}
      {method === 'structured' && <section>
        <h3>HTML・構造化JSONを読み込む</h3><p className="help-text">クックパッドは元ページのHTMLから材料欄を読み取れます。HTMLかschema.orgのRecipe JSONを貼り付ける、またはファイルを選択してください。端末内で解析するのでオフラインでも使えます。本文だけの場合は「本文・AI」を選びます。</p>
        <input hidden ref={fileInput} type="file" accept=".html,.htm,.json,text/html,application/json,application/ld+json" aria-label="取り込むHTML・JSONファイル" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void action(async () => {
            if (file.size > MAX_IMPORT_BYTES) throw new AppError('IMP-1004', { phase: 'ファイル読込' }, 'HTML・JSONファイルは2MB以下にしてください');
            let input: string;
            try { input = await file.text(); } catch { throw new AppError('IMP-3007'); }
            setStructured(input); loadStructured(input);
          }, '内容を確認して保存してください');
        }} />
        <button className="button secondary full" onClick={() => fileInput.current?.click()}>HTML・JSONファイルを選択</button>
        <label>HTML・構造化JSON<textarea aria-label="HTML・構造化JSON" rows={7} maxLength={MAX_IMPORT_BYTES} value={structured} onChange={event => setStructured(event.target.value)} /></label>
        <button className="button primary full" disabled={!structured.trim()} onClick={() => void action(async () => loadStructured(structured), '内容を確認して保存してください')}>構造化データを解析する</button>
      </section>}
    </>}
  </Modal>;
}
