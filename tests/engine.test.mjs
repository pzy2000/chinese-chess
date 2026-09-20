import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, mvOf } from './engine.mjs';

const E = await loadEngine();
const board = fen => E.fromFEN(fen).board;
const has = (moves, from, to) => moves.some(m => m.from === from && m.to === to);

describe('走法生成（perft 权威校验）', () => {
  const bd = board(E.INIT_FEN);
  const expect = [44, 1920, 79666, 3290240];
  for (let d = 1; d <= 4; d++){
    test(`perft(${d}) = ${expect[d-1]}`, { timeout: 60000 }, () => {
      assert.equal(E.perft(bd.slice(), 'r', d), expect[d-1]);
    });
  }
  test('初始红方合法着法 = 44', () => {
    assert.equal(E.legalMoves(board(E.INIT_FEN), 'r').length, 44);
  });
});

describe('棋规', () => {
  test('蹩马腿：马腿被占则该方向不可走', () => {
    const bd = board('4k4/9/9/9/4P4/4N4/9/9/9/4K4 w - - 0 1');
    const ms = E.legalMoves(bd, 'r').filter(m => m.from === 49);   // 马在 (5,4)
    assert.ok(!has(ms, 49, 30), '不该能走到 (3,3)');
    assert.ok(!has(ms, 49, 32), '不该能走到 (3,5)');
    assert.ok(has(ms, 49, 68), '应能走到 (7,5)');
  });

  test('塞象眼：象眼被占则该方向不可走', () => {
    const bd = board('4k4/9/9/9/9/9/9/9/1P7/2B1K4 w - - 0 1');
    const ms = E.legalMoves(bd, 'r').filter(m => m.from === 83);   // 相在 (9,2)
    assert.ok(!has(ms, 83, 63), '不该能走到 (7,0)');
    assert.ok(has(ms, 83, 67), '应能走到 (7,4)');
  });

  test('炮翻山：隔一子可吃，不能吃炮架', () => {
    const bd = board('3k5/r8/9/p8/9/C8/9/9/9/4K4 w - - 0 1');
    const ms = E.legalMoves(bd, 'r').filter(m => m.from === 45);   // 炮在 (5,0)
    const cap = ms.find(m => m.to === 9);
    assert.ok(cap && cap.captured === 'r', '应能隔卒吃车');
    assert.ok(!has(ms, 45, 27), '不能吃炮架上的卒');
    assert.ok(has(ms, 45, 36), '无子挡路时可平移');
  });

  test('兵过河才能横走，且永不后退', () => {
    const bd = board('3k5/9/9/9/4P4/2P6/9/9/9/4K4 w - - 0 1');
    const crossed = E.legalMoves(bd, 'r').filter(m => m.from === 40);  // (4,4) 已过河
    assert.ok(has(crossed, 40, 39) && has(crossed, 40, 41), '过河兵可横走');
    assert.ok(has(crossed, 40, 31), '可进');
    assert.equal(crossed.length, 3, '且不能后退');
    const notCrossed = E.legalMoves(bd, 'r').filter(m => m.from === 47); // (5,2) 未过河
    assert.equal(notCrossed.length, 1, '未过河兵只能进');
    assert.ok(has(notCrossed, 47, 38));
  });

  test('九宫限制：帅不能出宫', () => {
    const bd = board('3k5/9/9/9/9/9/9/9/9/4K4 w - - 0 1');
    const ms = E.legalMoves(bd, 'r').filter(m => m.from === 85);   // 帅在 (9,4)
    assert.ok(has(ms, 85, 76), '可走到 (8,4)');
    assert.ok(!has(ms, 85, 58), '不能走到 (6,4)');
    assert.ok(!has(ms, 85, 84), '宫内 (9,3) 也不可与将照面');
  });

  test('将帅照面等价于被将军', () => {
    const bd = board('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1');
    assert.equal(E.isChecked(bd, 'r'), true);
    assert.equal(E.isChecked(bd, 'b'), true);
  });

  test('困毙：无子可走但未被将军', () => {
    const bd = board('3k5/8R/9/9/9/9/9/9/4R4/5K3 b - - 0 1');
    assert.equal(E.legalMoves(bd, 'b').length, 0, '黑方无合法着法');
    assert.equal(E.isChecked(bd, 'b'), false, '但未被将军 → 困毙判负');
  });

  test('将帅不可走入对方攻击线', () => {
    const bd = board('4k4/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1');   // 黑车照着帅
    const ms = E.legalMoves(bd, 'r').filter(m => m.from === 85);
    assert.ok(!has(ms, 85, 76), '不能往上撞车口');
    assert.ok(has(ms, 85, 84) || has(ms, 85, 86), '可横向避将');
  });
});

describe('FEN', () => {
  test('初始 FEN 往返一致', () => {
    const st = E.fromFEN(E.INIT_FEN);
    assert.equal(E.toFEN(st.board, st.turn), E.INIT_FEN);
  });
  test('解析棋子数量与位置', () => {
    const bd = board(E.INIT_FEN);
    assert.equal(bd.filter(Boolean).length, 32);
    assert.equal(bd[0], 'r');                 // row0 col0 = 黑车
    assert.equal(bd[85], 'K');                // row9 col4 = 红帅
    assert.equal(bd[4], 'k');                 // row0 col4 = 黑将
  });
});

describe('中文棋谱', () => {
  test('炮二平五 / 马二进三', () => {
    const bd = board(E.INIT_FEN);
    assert.equal(E.notation(bd, {from:70, to:67, piece:'C', captured:null}), '炮二平五');
    assert.equal(E.notation(bd, {from:88, to:69, piece:'N', captured:null}), '马二进三');
  });
  test('同线两车用「前/后」区分', () => {
    const bd = board('3k5/9/9/9/9/9/9/R8/9/R3K4 w - - 0 1');
    assert.equal(E.notation(bd, {from:63, to:54, piece:'R', captured:null}), '前车进一');
    assert.equal(E.notation(bd, {from:81, to:72, piece:'R', captured:null}), '后车进一');
  });
});

describe('长打裁决', () => {
  test('无重复局面时不判罚', () => {
    const fen = '3k5/9/9/9/9/R8/9/9/9/4K4 w - - 0 1';
    const bd = board(fen);
    const m1 = mvOf(E, bd, 'r', 45, 46);
    assert.ok(m1);
    assert.equal(E.repetitionVerdict(fen, [m1]), null);
  });

  test('双方均无犯例，三次重复作和', () => {
    // 双方各拿一个「不能吃子也不能将杀」的仕/士来回走，保证都是「闲」
    const fen = '3k5/4a4/9/9/9/9/9/9/4A4/4K4 w - - 0 1';   // 红仕 (8,4)，黑士 (1,4)
    const bd = board(fen);
    const hist = [];
    for (let i = 0; i < 4; i++){                        // 4 个来回 = 8 手 → 同一局面第 3 次出现
      const rm = mvOf(E, bd, 'r', i % 2 === 0 ? 76 : 66, i % 2 === 0 ? 66 : 76);
      assert.ok(rm, '仕的第 ' + (hist.length+1) + ' 手');
      hist.push(rm); E.makeMove(bd, rm);
      const bm = mvOf(E, bd, 'b', i % 2 === 0 ? 13 : 21, i % 2 === 0 ? 21 : 13);
      assert.ok(bm, '士的第 ' + (hist.length+1) + ' 手');
      hist.push(bm); E.makeMove(bd, bm);
    }
    const v = E.repetitionVerdict(fen, hist);
    assert.ok(v, '应判定为重复局面');
    assert.ok(v.count >= 3, 'count=' + v.count);
    assert.equal(v.kind, 'draw');
    assert.equal(v.winner, null);
  });

  test('单方长将 → 长将方判负', () => {
    const fen = '4k4/9/9/9/9/3R5/9/9/9/5K3 w - - 0 1';   // 车 (5,3)，黑将 (0,4)
    const bd = board(fen);
    const hist = [];
    // 车在 (5,3)/(5,4) 之间来回照将，黑将左右挪，4 个来回 = 8 手
    for (let i = 0; i < 4; i++){
      const rm = mvOf(E, bd, 'r', i % 2 === 0 ? 48 : 49, i % 2 === 0 ? 49 : 48);
      assert.ok(rm, '车的第 ' + (hist.length+1) + ' 手');
      hist.push(rm); E.makeMove(bd, rm);
      const km = mvOf(E, bd, 'b', i % 2 === 0 ? 4 : 3, i % 2 === 0 ? 3 : 4);
      assert.ok(km, '将的第 ' + (hist.length+1) + ' 手');
      hist.push(km); E.makeMove(bd, km);
    }
    const v = E.repetitionVerdict(fen, hist);
    assert.ok(v && v.count >= 3, 'count=' + (v && v.count));
    assert.equal(v.kind, 'forfeit');
    assert.equal(v.winner, 'b', '红方长将，黑方胜');
  });
});

describe('评估与搜索', () => {
  test('初始局面均势', () => {
    assert.equal(E.evaluate(board(E.INIT_FEN)), 0);
  });
  test('findBestMove 返回合法着法', async () => {
    const bd = board(E.INIT_FEN);
    const m = await E.findBestMove(bd, 'r', 0, null, 100);
    assert.ok(E.legalMoves(bd, 'r').some(x => x.from === m.from && x.to === m.to));
  });
  test('analyze 返回合法着法与有限分数', async () => {
    const bd = board(E.INIT_FEN);
    const a = await E.analyze(bd, 'r', 1, 200);
    assert.ok(a.move, '应给出着法');
    assert.ok(Number.isFinite(a.score), '分数应为有限值');
    assert.ok(E.legalMoves(bd, 'r').some(x => x.from === a.move.from && x.to === a.move.to));
  });
  test('analyze 能看出白吃一个车', async () => {
    // 红车 (5,4) 可白吃黑车 (4,4)
    const bd = board('4k4/9/9/9/4r4/4R4/9/9/9/5K3 w - - 0 1');
    const a = await E.analyze(bd, 'r', 1, 300);
    assert.ok(a.score > 300, 'score=' + a.score);
    assert.equal(a.move.to, 40, '应吃掉 (4,4) 的车');
  });
});
