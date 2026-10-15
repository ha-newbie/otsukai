import { normalizeName } from './models';

/** Group labels are presentation, not part of a food's shared identity. */
export function ingredientName(value: string): string {
  return value.normalize('NFKC').trim().replace(/^(?:(?:[★☆●○◎◇◆■□▲△＊*]+|\([A-Za-z]\)|[A-Z][.:：])\s*|[A-Z]\s+)+/, '').trim();
}
const seasonings = new Set([
  '塩', '食塩', '岩塩', '粗塩', '砂糖', '上白糖', '三温糖', 'グラニュー糖', 'きび砂糖', '黒砂糖',
  'しょうゆ', '醤油', '濃口しょうゆ', '濃口醤油', '薄口しょうゆ', '薄口醤油', 'うすくちしょうゆ', '減塩しょうゆ',
  '味噌', 'みそ', '白味噌', '赤味噌', '白みそ', '赤みそ', 'みりん', '本みりん', '酒', '料理酒', '酢', '米酢', '穀物酢', '黒酢',
  'こしょう', '胡椒', 'コショウ', '黒こしょう', '黒胡椒', '白こしょう', '白胡椒', 'ブラックペッパー', '塩こしょう', '塩コショウ', '塩胡椒',
  'サラダ油', 'ごま油', '胡麻油', 'オリーブ油', 'オリーブオイル', '油', '米油', 'こめ油',
  'めんつゆ', '麺つゆ', '白だし', '顆粒だし', '和風だしの素', 'だしの素', 'ほんだし', 'コンソメ', '鶏がらスープの素', '鶏ガラスープの素',
  'オイスターソース', 'ウスターソース', '中濃ソース', 'とんかつソース', 'ケチャップ', 'トマトケチャップ', 'マヨネーズ',
  '豆板醤', '甜麺醤', 'コチュジャン', 'ポン酢', 'ポン酢しょうゆ', 'ポン酢醤油',
].map(normalizeName));
/** Conservative suggestions only; e.g. 塩鮭 and 豆乳 must stay regular foods. */
export function suggestedCategory(value: string): 'seasoning' | 'other' {
  const name = normalizeName(ingredientName(value)).replace(/\s+/g, '').replace(/\([^)]*\)/g, '');
  return seasonings.has(name) ? 'seasoning' : 'other';
}
