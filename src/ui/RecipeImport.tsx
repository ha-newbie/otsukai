import { useRef, useState, type FormEvent } from 'react';
import type { AppData } from '../domain/models';
import { importSourceUrl, MAX_IMPORT_BYTES, parseAIRecipeAnswer, parseStructuredRecipes, type ImportedRecipe } from '../domain/recipe-import';
import { manualRecipeSchema, type RecipeInput } from '../domain/recipe-input';
import { repository } from '../persistence/repository';
import { recipePrompt } from '../services/ai';
import { fetchRecipePage } from '../services/recipe-import';
import { Modal, type Action } from './components';
import { RecipeFields } from './RecipeFields';

type Method = 'url' | 'ai' | 'structured';
export function RecipeImport({ data, action, onClose }: { data: AppData; action: Action; onClose: () => void }) {
  const [method, setMethod] = useState<Method>('url');
  const [sourceUrl, setSourceUrl] = useState('');
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [json, setJSON] = useState('');
  const [structured, setStructured] = useState('');
  const [candidates, setCandidates] = useState<ImportedRecipe[]>([]);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<RecipeInput | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const context = { sourceUrl, source, defaultServings: data.settings[0]?.defaultServings ?? 2 };
  const showCandidates = (values: ImportedRecipe[]) => {
    setCandidates(values); setSelected(0); setDraft(values[0]?.recipe ?? null);
  };
  const loadStructured = (input: string) => showCandidates(parseStructuredRecipes(input, context));
  const copyPrompt = () => void action(async () => {
    if (!text.trim() && !sourceUrl.trim()) throw new Error('元レシピのURLか本文を入力してください');
    importSourceUrl(sourceUrl);
    if (!navigator.clipboard) throw new Error('コピーに対応していません。「プロンプトを表示」から選択してコピーしてください');
    await navigator.clipboard.writeText(recipePrompt(text, context));
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
        {!!chosen?.warnings.length && <ul>{chosen.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </div>
      {!!chosen?.originalIngredients.length && <details><summary>元の材料表記を確認</summary><ul className="original-ingredients">{chosen.originalIngredients.map((line, index) => <li key={index}>{line}</li>)}</ul>{chosen.originalYield && <p className="help-text">元の分量：{chosen.originalYield}</p>}</details>}
      <form onSubmit={event => void save(event)}><RecipeFields value={draft} onChange={setDraft} categories={data.categories} /><button className="button primary full" type="submit">この内容で保存する</button></form>
    </> : <>
      <p className="subtle">元サイトの利用条件を守り、自分用のレシピとして取り込みます。取得・解析だけでは保存されません。</p>
      <label>元レシピのURL <span className="optional">任意</span><input type="url" maxLength={2000} value={sourceUrl} placeholder="https://…" onChange={event => setSourceUrl(event.target.value)} /></label>
      <label>出典 <span className="optional">任意</span><input maxLength={200} value={source} placeholder="サイト名・作者名" onChange={event => setSource(event.target.value)} /></label>
      <div className="import-methods" role="group" aria-label="取込方法">
        <button aria-pressed={method === 'url'} onClick={() => setMethod('url')}>URL</button><button aria-pressed={method === 'ai'} onClick={() => setMethod('ai')}>本文・AI</button><button aria-pressed={method === 'structured'} onClick={() => setMethod('structured')}>HTML・JSON</button>
      </div>
      {method === 'url' && <section>
        <h3>URLから読み込む</h3><p className="help-text">ブラウザからの取得を許可し、レシピの構造化データを持つページに対応しています。多くのサイトは直接取得できません。その場合は「本文・AI」か「HTML・JSON」を使ってください。</p>
        <button className="button primary full" disabled={!sourceUrl.trim()} onClick={() => void action(async () => loadStructured(await fetchRecipePage(sourceUrl)), '内容を確認して保存してください')}>URLから取得する</button>
        <p className="help-text">オンラインで、ログイン不要のhttpsページを取得します。転送がある場合は元サイトで開いた後のURLを入力してください。元サイトへ閲覧通信が発生します。</p>
      </section>}
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
        <h3>HTML・構造化JSONを読み込む</h3><p className="help-text">元ページのHTMLかschema.orgのRecipe JSONを貼り付ける、またはファイルを選択します。端末内で解析するのでオフラインでも使えます。本文だけの場合は「本文・AI」を選んでください。</p>
        <input hidden ref={fileInput} type="file" accept=".html,.htm,.json,text/html,application/json,application/ld+json" aria-label="取り込むHTML・JSONファイル" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void action(async () => {
            if (file.size > MAX_IMPORT_BYTES) throw new Error('HTML・JSONファイルは2MB以下にしてください');
            const input = await file.text(); setStructured(input); loadStructured(input);
          }, '内容を確認して保存してください');
        }} />
        <button className="button secondary full" onClick={() => fileInput.current?.click()}>HTML・JSONファイルを選択</button>
        <label>HTML・構造化JSON<textarea rows={7} maxLength={MAX_IMPORT_BYTES} value={structured} onChange={event => setStructured(event.target.value)} /></label>
        <button className="button primary full" disabled={!structured.trim()} onClick={() => void action(async () => loadStructured(structured), '内容を確認して保存してください')}>構造化データを解析する</button>
      </section>}
    </>}
  </Modal>;
}
