// 从 index.html 抽取 /*<ENGINE>*/ … /*</ENGINE>*/ 段，作为临时 ES 模块加载。
// 引擎段必须保持无 DOM，否则这里会直接报错。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const INDEX_HTML = path.resolve(HERE, '..', 'index.html');

const EXPORTS = [
  'ROWS', 'COLS', 'N', 'INIT_FEN', 'VAL', 'MATE', 'NATURAL_LIMIT', 'TAG_CN', 'DA_TAGS',
  'at', 'rowOf', 'colOf', 'inB', 'sideOf', 'typeOf', 'other', 'inPalace',
  'genMoves', 'makeMove', 'unmakeMove', 'findKing', 'isChecked', 'legalMoves', 'perft',
  'toFEN', 'fromFEN', 'notation', 'numTxt', 'fileNum',
  'halfmoveClock', 'naturalLimitVerdict', 'fenIssues',
  'attackersOf', 'hasAttacker', 'see', 'blocksLine',
  'threatMate', 'threatCapture', 'threatKind', 'classifyMove', 'repetitionVerdict',
  'evaluate', 'evalFor', 'findBestMove', 'analyze'
];

let cache = null;
export async function loadEngine(){
  if (cache) return cache;
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const m = html.match(/\/\*<ENGINE>\*\/([\s\S]*?)\/\*<\/ENGINE>\*\//);
  if (!m) throw new Error('index.html 里找不到 /*<ENGINE>*/ 段');
  const src = m[1] + '\nexport { ' + EXPORTS.join(', ') + ' };\n';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xq-engine-'));
  const file = path.join(dir, 'engine.mjs');
  fs.writeFileSync(file, src);
  cache = await import(pathToFileURL(file).href);
  return cache;
}

// 在给定局面里找出 from→to 的合法着法
export function mvOf(E, bd, side, from, to){
  return E.legalMoves(bd, side).find(m => m.from === from && m.to === to) || null;
}
