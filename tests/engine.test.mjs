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

describe('FEN 结构解析', () => {
  test('halfmove / fullmove 往返', () => {
    const st = E.fromFEN('4k4/9/9/9/9/9/9/9/9/4K4 b - - 3 7');
    assert.equal(st.half, 3);
    assert.equal(st.full, 7);
    assert.equal(st.turn, 'b');
    assert.equal(E.toFEN(st.board, st.turn, st.half, st.full),
                 '4k4/9/9/9/9/9/9/9/9/4K4 b - - 3 7');
  });
  test('缺省参数仍输出 0 1（兼容初始值）', () => {
    assert.equal(E.toFEN(board(E.INIT_FEN), 'r'), E.INIT_FEN);
    assert.equal(E.toFEN(board(E.INIT_FEN), 'r', 5, 9), E.INIT_FEN.replace('0 1', '5 9'));
  });
  test('结构非法时抛错', () => {
    assert.throws(() => E.fromFEN('4k4/9/9/9/9/9/9/9/9 w - - 0 1'), /行/);      // 少一行
    assert.throws(() => E.fromFEN('4k4/9/9/9/9/9/9/9/9/4K5 w - - 0 1'), /列/);  // 列数 10
    assert.throws(() => E.fromFEN('4k4/9/9/9/9/9/9/9/9/4KQ3 w - - 0 1'), /非法字符/);
  });
});

describe('自然限着（60 回合 = 120 半回合）', () => {
  test('119 手无吃子不判和，120 手判和', () => {
    const ms = n => Array.from({length:n}, () => ({captured:null}));
    assert.equal(E.halfmoveClock(E.INIT_FEN, ms(119)), 119);
    assert.equal(E.naturalLimitVerdict(E.INIT_FEN, ms(119)), null);
    const v = E.naturalLimitVerdict(E.INIT_FEN, ms(120));
    assert.ok(v && v.kind === 'draw' && v.winner === null, JSON.stringify(v));
    assert.equal(v.half, E.NATURAL_LIMIT);
  });
  test('吃子清零，兵的推进不清零', () => {
    const ms = n => Array.from({length:n}, () => ({captured:null}));
    const h = E.halfmoveClock(E.INIT_FEN, ms(119).concat([{captured:'p'}]));
    assert.equal(h, 0, '吃子后应清零');
    const h2 = E.halfmoveClock(E.INIT_FEN, ms(119).concat([{captured:'p'}]).concat(ms(119)));
    assert.equal(h2, 119);
    assert.equal(E.naturalLimitVerdict(E.INIT_FEN, ms(119).concat([{captured:'p'}]).concat(ms(119))), null);
  });
  test('计数从 FEN 自带的 halfmove 起算', () => {
    const fen = '4k4/9/9/9/9/9/9/9/9/4K4 w - - 37 42';
    assert.equal(E.halfmoveClock(fen, []), 37);
    assert.ok(E.naturalLimitVerdict(fen, Array.from({length:83}, () => ({captured:null}))));
  });
});

describe('局面合法性校验（FEN 载入 / 导入 / 存档）', () => {
  const issues = fen => { const st = E.fromFEN(fen); return E.fenIssues(st.board, st.turn); };
  test('合法局面无错误', () => {
    assert.deepEqual(issues(E.INIT_FEN), []);
    assert.deepEqual(issues('4k4/9/9/9/9/9/9/9/9/5K3 w - - 0 1'), []);
    assert.deepEqual(issues('3ak4/4a4/9/9/9/9/9/9/4A4/3AK4 w - - 0 1'), []);
  });
  test('兵 / 卒 在不该出现的行 → 报错', () => {
    assert.ok(issues('4k4/9/9/9/9/9/9/9/4P4/4K4 w - - 0 1').length, '红兵在第 9 行');
    assert.ok(issues('4k4/4p4/9/9/9/9/9/9/9/4K4 w - - 0 1').length, '黑卒在第 2 行');
  });
  test('士 / 象 / 帅 越界 → 报错', () => {
    assert.ok(issues('4k4/9/9/9/9/9/9/9/9/2A1K4 w - - 0 1').length, '仕出九宫');
    assert.ok(issues('4k4/9/9/9/2B6/9/9/9/9/4K4 w - - 0 1').length, '相已过河');
    assert.ok(issues('4k4/9/9/9/9/9/9/9/2B6/4K4 w - - 0 1').length, '相不在象位');
    assert.ok(issues('4k4/9/9/9/9/9/9/9/9/K8 w - - 0 1').length, '帅出九宫');
  });
  test('缺将 / 多帅 / 子力超限 → 报错', () => {
    assert.ok(issues('9/9/9/9/9/9/9/9/9/4K4 w - - 0 1').length, '缺黑将');
    assert.ok(issues('4k4/9/9/9/9/9/9/9/9/K3K4 w - - 0 1').length, '两个红帅');
    assert.deepEqual(issues('r3k4/9/9/9/9/9/9/9/9/R4K3 w - - 0 1'), [], '两车合法');
    assert.ok(issues('3k5/9/9/9/9/9/9/9/9/RRR1K4 w - - 0 1').length, '三个红车超限');
  });
  test('非走子方已被将 / 将帅照面 → 报错', () => {
    assert.ok(issues('4k4/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1').length, '红走但黑已被将');
    assert.ok(issues('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1').length, '将帅照面');
    assert.deepEqual(issues('4k4/9/9/9/9/9/9/9/4R4/4K4 b - - 0 1'), [], '黑走、黑被将是合法的');
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

describe('SEE 静态兑换评估（净得子判定）', () => {
  test('白吃无根子 → 净得子', () => {
    const bd = board('4k4/9/9/9/4n4/4R4/9/9/9/5K3 w - - 0 1');   // 车(5,4) 吃 马(4,4)
    assert.ok(E.see(bd, 40, 'r') > 0, 'see=' + E.see(bd, 40, 'r'));
    assert.equal(E.threatCapture(bd, 'r'), true);
  });
  test('车吃「卒看着」的马是亏的，不算捉', () => {
    const bd = board('4k4/9/9/4p4/4n4/4R4/9/9/9/5K3 w - - 0 1'); // 卒(3,4) 保 马(4,4)
    assert.ok(E.see(bd, 40, 'r') < 0, 'see=' + E.see(bd, 40, 'r'));
    assert.equal(E.threatCapture(bd, 'r'), false, '不是捉');
  });
  test('等价互吃 → 净收益 0', () => {
    const bd = board('4k4/9/4r4/9/4r4/4R4/9/9/9/5K3 w - - 0 1'); // 车吃车、车吃回
    const v = E.see(bd, 40, 'r');
    assert.ok(Math.abs(v) < 1, 'see=' + v);
  });
  test('多子捉一子：车换车后炮还能吃回 → 净得子', () => {
    // 列 4：黑车(2,4) 黑车(4,4) 红车(5,4) 红兵(6,4) 红炮(7,4)
    const bd = board('4k4/9/4r4/9/4r4/4R4/4P4/4C4/9/5K3 w - - 0 1');
    const v = E.see(bd, 40, 'r');
    assert.ok(v > 0, 'see=' + v + '，应判为捉');
    assert.equal(E.threatCapture(bd, 'r'), true);
  });
});

describe('着法性质细分（将 / 解将 / 兑 / 献 / 拦 / 跟）', () => {
  const cls = (fen, from, to) => {
    const bd = board(fen);
    const m = mvOf(E, bd, E.fromFEN(fen).turn, from, to);
    assert.ok(m, '着法 ' + from + '→' + to + ' 不合法');
    return E.classifyMove(bd.slice(), m);
  };
  test('主动照将 = 将', () => {
    assert.equal(cls('4k4/9/9/9/9/3R5/9/9/9/5K3 w - - 0 1', 48, 49), 'check');
  });
  test('被将后单纯应将 = 解将（非打）', () => {
    // 红车(8,4) 照将，黑将 (0,4)→(0,3) 只是解将
    assert.equal(cls('4k4/9/9/9/9/9/9/9/4R4/5K3 b - - 0 1', 4, 3), 'parry');
    assert.equal(E.DA_TAGS.has('parry'), false);
  });
  test('解将同时反将 = 反将（仍属打）', () => {
    // 红车(7,4) 照将，黑马(9,5) 吃掉它并同时照住红帅(9,3)
    assert.equal(cls('4k4/9/9/9/9/9/9/4R4/9/3K1n3 b - - 0 1', 86, 67), 'counter');
    assert.equal(E.DA_TAGS.has('counter'), true);
  });
  test('等价交换的威胁 = 兑', () => {
    assert.equal(cls('4k4/9/4r4/9/4r4/R8/9/9/9/5K3 w - - 0 1', 45, 49), 'exch');
  });
  test('送吃（对方吃了不吃亏）= 献', () => {
    // 红马(6,5) 跳到 (4,4)，黑车(2,4) 可白吃
    assert.equal(cls('k8/9/4r4/9/9/9/5N3/9/9/5K3 w - - 0 1', 59, 40), 'offer');
  });
  test('有根子挡住对方车的射线 = 拦', () => {
    // 同上但 (5,4) 有红兵：马不再送吃，而是切断黑车(2,4) 对红兵的攻击
    assert.equal(cls('k8/9/4r4/9/9/4P4/5N3/9/9/5K3 w - - 0 1', 59, 40), 'block');
  });
  test('盯住有根子（吃了吃亏）= 跟', () => {
    // 红车(6,0) 平到 (4,0)，盯住被黑车(2,4) 保着的卒(4,4)
    assert.equal(cls('8k/9/4r4/9/4p4/9/R8/9/9/4K4 w - - 0 1', 54, 36), 'follow');
  });
});

describe('长打裁决（细化后）', () => {
  test('长捉 vs 长闲 → 长捉方判负', () => {
    const fen = '4k4/9/9/9/R3n4/9/9/9/9/5K3 w - - 0 1';   // 红车在 (4,0)，黑马 (4,4) 无根
    const bd = board(fen);
    const hist = [];
    for (let i = 0; i < 6; i++){                          // 3 个来回：车(4,0)↔(4,1)，将(0,4)↔(0,3)
      const rm = mvOf(E, bd, 'r', i % 2 === 0 ? 36 : 37, i % 2 === 0 ? 37 : 36);
      assert.ok(rm, '红车第 ' + (hist.length+1) + ' 手');
      hist.push(rm); E.makeMove(bd, rm);
      const bm = mvOf(E, bd, 'b', i % 2 === 0 ? 4 : 3, i % 2 === 0 ? 3 : 4);
      assert.ok(bm, '黑将第 ' + (hist.length+1) + ' 手');
      hist.push(bm); E.makeMove(bd, bm);
    }
    const v = E.repetitionVerdict(fen, hist);
    assert.ok(v && v.count >= 3, 'count=' + (v && v.count));
    assert.deepEqual(v.tags.r, ['chase','chase'], '红方两着都是捉');
    assert.deepEqual(v.tags.b, ['idle','idle'], '黑方两着都是闲');
    assert.equal(v.kind, 'forfeit');
    assert.equal(v.winner, 'b', '红方长捉判负');
  });
  test('一捉一闲不属长打 → 作和', () => {
    const fen = '4k4/9/9/9/R3n4/9/9/9/9/5K3 w - - 0 1';
    const bd = board(fen);
    const hist = [];
    for (let i = 0; i < 6; i++){                          // 车在 (4,0)↔(5,0)：只有回到 (4,0) 的那一手是捉
      const rm = mvOf(E, bd, 'r', i % 2 === 0 ? 36 : 45, i % 2 === 0 ? 45 : 36);
      assert.ok(rm, '红车第 ' + (hist.length+1) + ' 手');
      hist.push(rm); E.makeMove(bd, rm);
      const bm = mvOf(E, bd, 'b', i % 2 === 0 ? 4 : 3, i % 2 === 0 ? 3 : 4);
      assert.ok(bm, '黑将第 ' + (hist.length+1) + ' 手');
      hist.push(bm); E.makeMove(bd, bm);
    }
    const v = E.repetitionVerdict(fen, hist);
    assert.ok(v && v.count >= 3);
    assert.equal(v.kind, 'draw', '一捉一闲是允许着法');
    assert.equal(v.winner, null);
  });
  test('长将时对方的应将记「解将」，仍判长将方负', () => {
    const fen = '4k4/9/9/9/9/3R5/9/9/9/5K3 w - - 0 1';
    const bd = board(fen);
    const hist = [];
    for (let i = 0; i < 4; i++){
      const rm = mvOf(E, bd, 'r', i % 2 === 0 ? 48 : 49, i % 2 === 0 ? 49 : 48);
      hist.push(rm); E.makeMove(bd, rm);
      const bm = mvOf(E, bd, 'b', i % 2 === 0 ? 4 : 3, i % 2 === 0 ? 3 : 4);
      hist.push(bm); E.makeMove(bd, bm);
    }
    const v = E.repetitionVerdict(fen, hist);
    assert.deepEqual(v.tags.b, ['parry','parry'], '黑方是解将，不算将');
    assert.equal(v.kind, 'forfeit');
    assert.equal(v.winner, 'b');
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
