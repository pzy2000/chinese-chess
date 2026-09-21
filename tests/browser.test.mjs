// 浏览器集成测试（真实时间）：走子交互、AI、悔棋/前进、提示、回看、存档、观战、移动端。
// 需要 playwright-core + 本机浏览器，缺任一则整体 skip。
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser, INDEX_URL } from './browser.mjs';

let C = null;                       // 测试上下文（浏览器不可用则为 null）
let geo = null;                     // 棋盘几何
const errors = () => C ? C.errors : [];

before(async () => { C = await openBrowser(); if (C) geo = await boardGeo(C.page); });
after(async () => { if (C) await C.close(); });

function need(t){ if (!C){ t.skip('缺少 playwright-core 或浏览器'); return false; } return true; }

async function boardGeo(page){
  return page.evaluate(() => {
    const b = document.querySelector('#board').getBoundingClientRect();
    return { left: b.left, top: b.top, cell: G.cell, pad: G.pad };
  });
}
const pt = (vr, vc) => ({ x: geo.left + geo.pad + vc * geo.cell, y: geo.top + geo.pad + vr * geo.cell });
const clickCell = async (page, vr, vc) => { const p = pt(vr, vc); await page.mouse.click(p.x, p.y); await page.waitForTimeout(70); };
const dragCell = async (page, from, to) => {
  const a = pt(from[0], from[1]), z = pt(to[0], to[1]);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 8, a.y - 10, { steps: 3 });
  await page.mouse.move(z.x, z.y, { steps: 8 });
  await page.mouse.up(); await page.waitForTimeout(120);
};
const snap = page => page.evaluate(() => ({ len: G.history.length, fen: toFEN(G.board, G.turn), turn: G.turn }));

describe('启动与渲染', () => {
  test('perft 自测通过（?test=1）', async t => {
    if (!need(t)) return;
    await C.page.goto(C.page.url().split('?')[0] + '?test=1');
    await C.page.waitForFunction(() => window.__XIANGQI_TEST__);
    const log = await C.page.evaluate(() => window.__XIANGQI_TEST__);
    assert.ok(log.length >= 4);
    assert.ok(log.every(l => !l.includes('FAIL')), log.join(' | '));
    await C.page.goto(C.page.url().split('?')[0]);
    await C.page.waitForFunction(() => typeof G !== 'undefined');
  });

  test('初始 32 子且棋盘有尺寸', async t => {
    if (!need(t)) return;
    const n = await C.page.evaluate(() => document.querySelectorAll('.piece').length);
    const w = await C.page.evaluate(() => document.querySelector('#board').getBoundingClientRect().width);
    assert.equal(n, 32);
    assert.ok(w > 200, 'width=' + w);
  });

  test('每个棋子都有 aria-label', async t => {
    if (!need(t)) return;
    const missing = await C.page.evaluate(() =>
      [...document.querySelectorAll('.piece')].filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(missing, 0);
  });
});

describe('走子交互（双人模式）', () => {
  before(async () => {
    if (!C) return;
    await C.page.selectOption('#selMode', 'pvp');
    await C.page.click('#btnNew');
    await C.page.evaluate(() => { G.flip = false; renderAll(); render(); });
    await C.page.waitForTimeout(150);
    geo = await boardGeo(C.page);
  });

  test('拖拽走子', async t => {
    if (!need(t)) return;
    await dragCell(C.page, [9, 7], [7, 6]);
    const s = await snap(C.page);
    assert.equal(s.len, 1);
    assert.equal(await C.page.evaluate(() => G.history[0].notation), '马二进三');
  });

  test('点击走子（选中 → 落点）', async t => {
    if (!need(t)) return;
    await clickCell(C.page, 2, 7);
    assert.equal(await C.page.evaluate(() => G.selected), 25);
    await clickCell(C.page, 2, 4);
    const s = await snap(C.page);
    assert.equal(s.len, 2);
    assert.equal(await C.page.evaluate(() => G.history[1].notation), '炮8平5');
  });

  test('非法落点回弹且不走子', async t => {
    if (!need(t)) return;
    const before = await snap(C.page);
    await dragCell(C.page, [9, 0], [5, 0]);        // 红车被黑卒挡住
    const after = await snap(C.page);
    assert.deepEqual(after, before);
    assert.equal(await C.page.evaluate(() => document.querySelectorAll('.piece.drag').length), 0);
    assert.ok(await C.page.evaluate(() => !!G.els.get(81)), '红车应还在原位');
  });

  test('棋谱文本与行数正确', async t => {
    if (!need(t)) return;
    const txt = await C.page.evaluate(() => moveText());
    assert.match(txt, /^1\. 马二进三 炮8平5$/);
    assert.equal(await C.page.evaluate(() => document.querySelectorAll('#mvBody tr').length), 1);
  });
});

describe('悔棋 / 前进', () => {
  let fenBeforeUndo = null;
  test('悔棋退一手', async t => {
    if (!need(t)) return;
    fenBeforeUndo = await C.page.evaluate(() => toFEN(G.board, G.turn));
    await C.page.click('#btnUndo');
    await C.page.waitForTimeout(150);
    const s = await snap(C.page);
    assert.equal(s.len, 1);
    assert.equal(await C.page.evaluate(() => G.future.length), 1);
  });

  test('前进还原且 FEN 一致', async t => {
    if (!need(t)) return;
    await C.page.click('#btnRedo');
    await C.page.waitForTimeout(200);
    const s = await snap(C.page);
    assert.equal(s.len, 2);
    assert.equal(s.fen, fenBeforeUndo);
    assert.equal(await C.page.evaluate(() => G.future.length), 0);
  });

  test('新走子后前进栈清空', async t => {
    if (!need(t)) return;
    await C.page.click('#btnUndo'); await C.page.waitForTimeout(150);
    await C.page.click('#btnUndo'); await C.page.waitForTimeout(150);
    await clickCell(C.page, 7, 7); await clickCell(C.page, 7, 4);
    assert.equal(await C.page.evaluate(() => G.future.length), 0);
    assert.equal(await C.page.evaluate(() => G.history.length), 1);
  });
});

describe('提示与评估条', () => {
  test('提示给出合法着法并高亮两处', async t => {
    if (!need(t)) return;
    await C.page.click('#btnHint');
    await C.page.waitForFunction(() => G.hint !== null || !G.thinking, null, { timeout: 15000 });
    await C.page.waitForTimeout(150);
    const h = await C.page.evaluate(() => G.hint && { ...G.hint });
    assert.ok(h, '应给出提示');
    assert.ok(await C.page.evaluate(x => legalMoves(G.board, G.turn).some(m => m.from === x.from && m.to === x.to), h));
    assert.equal(await C.page.evaluate(() => document.querySelectorAll('.mark.hint').length), 2);
  });

  test('再点一次提示可关闭', async t => {
    if (!need(t)) return;
    await C.page.click('#btnHint');
    await C.page.waitForTimeout(120);
    assert.equal(await C.page.evaluate(() => G.hint), null);
  });

  test('评估条输出文本与占比', async t => {
    if (!need(t)) return;
    const r = await C.page.evaluate(() => ({ txt: document.querySelector('#evalTxt').textContent, w: document.querySelector('#evalRed').style.width }));
    assert.match(r.txt, /均势|优|胜势/);
    assert.match(r.w, /^\d+(\.\d+)?%$/);
  });
});

describe('棋谱回看', () => {
  test('点击棋谱行进入回看', async t => {
    if (!need(t)) return;
    await C.page.evaluate(() => document.querySelectorAll('#mvBody tr')[0].click());
    await C.page.waitForTimeout(150);
    const r = await C.page.evaluate(() => ({ review: G.review, shown: document.querySelector('#revBar').classList.contains('show'), cls: document.querySelector('#board').classList.contains('reviewing') }));
    assert.equal(r.review, 1);
    assert.ok(r.shown && r.cls);
  });

  test('回看中禁止走子且不计时', async t => {
    if (!need(t)) return;
    assert.equal(await C.page.evaluate(() => myTurn()), false);
    const t0 = await C.page.evaluate(() => G.timers[G.turn]);
    await C.page.waitForTimeout(500);
    assert.equal(await C.page.evaluate(() => G.timers[G.turn]), t0);
  });

  test('‹ › 翻手', async t => {
    if (!need(t)) return;
    await C.page.evaluate(() => { newGame(); ['70.67','88.69'].forEach(x => {}); });
    await clickCell(C.page, 7, 7); await clickCell(C.page, 7, 4);
    await clickCell(C.page, 2, 7); await clickCell(C.page, 2, 4);
    await C.page.evaluate(() => document.querySelectorAll('#mvBody tr')[0].click());
    await C.page.waitForTimeout(120);
    assert.equal(await C.page.evaluate(() => G.review), 2);
    await C.page.click('#revPrev'); await C.page.waitForTimeout(120);
    assert.equal(await C.page.evaluate(() => G.review), 1);
    await C.page.click('#revNext'); await C.page.waitForTimeout(120);
    assert.equal(await C.page.evaluate(() => G.review), 2);
  });

  test('回看的是该手数后的局面', async t => {
    if (!need(t)) return;
    const same = await C.page.evaluate(() => toFEN(G.board, plyTurn(G.review)) === toFEN(boardAtPly(G.review), plyTurn(G.review)));
    assert.ok(same);
    assert.notEqual(await C.page.evaluate(() => G.review === null && false), true);
  });

  test('返回当前恢复实时局面', async t => {
    if (!need(t)) return;
    await C.page.click('#revExit');
    await C.page.waitForTimeout(150);
    const s = await snap(C.page);
    assert.equal(await C.page.evaluate(() => G.review), null);
    assert.equal(s.len, 2);
    assert.equal(await C.page.evaluate(() => document.querySelector('#board').classList.contains('reviewing')), false);
  });
});

describe('导出 / 导入 / 存档', () => {
  test('紧凑串格式正确', async t => {
    if (!need(t)) return;
    const rec = await C.page.evaluate(() => exportString());
    assert.match(rec, /^XQ1\|[^|]+\|(\d+\.\d+)(,\d+\.\d+)*$/);
  });

  test('导入还原同一局面', async t => {
    if (!need(t)) return;
    const rec = await C.page.evaluate(() => exportString());
    const fen = await C.page.evaluate(() => toFEN(G.board, G.turn));
    await C.page.click('#btnNew'); await C.page.waitForTimeout(150);
    const after = await C.page.evaluate(t => { loadRecord(t); return { len: G.history.length, fen: toFEN(G.board, G.turn) }; }, rec);
    assert.equal(after.len, 2);
    assert.equal(after.fen, fen);
  });

  test('非法棋谱串被拒绝', async t => {
    if (!need(t)) return;
    const msg = await C.page.evaluate(() => {
      try { loadRecord('随便一段文字'); return 'no-throw'; } catch (e) { return e.message; }
    });
    assert.notEqual(msg, 'no-throw');
    const bad = await C.page.evaluate(() => {
      try { loadRecord('XQ1|' + toFEN(fromFEN(INIT_FEN).board, 'r') + '|0.1'); return 'no-throw'; } catch (e) { return e.message; }
    });
    assert.notEqual(bad, 'no-throw', '非法着法也应拒绝');
  });

  test('刷新后存档还原', async t => {
    if (!need(t)) return;
    await C.page.click('#btnNew'); await C.page.waitForTimeout(120);
    await clickCell(C.page, 7, 7); await clickCell(C.page, 7, 4);
    const before = await C.page.evaluate(() => toFEN(G.board, G.turn));
    await C.page.reload();
    await C.page.waitForFunction(() => typeof G !== 'undefined');
    await C.page.waitForTimeout(200);
    const after = await C.page.evaluate(() => toFEN(G.board, G.turn));
    assert.equal(after, before);
    geo = await boardGeo(C.page);
  });
});

describe('中文棋谱导入', () => {
  before(async () => {
    if (!C) return;
    await C.page.selectOption('#selMode', 'pvp');
    await C.page.click('#btnNew');
    await C.page.evaluate(() => { G.flip = false; renderAll(); render(); });
    await C.page.waitForTimeout(150);
    geo = await boardGeo(C.page);
  });

  test('moveText() → loadNotation() 往返一致', async t => {
    if (!need(t)) return;
    await clickCell(C.page, 7, 7); await clickCell(C.page, 7, 4);   // 炮二平五
    await clickCell(C.page, 2, 7); await clickCell(C.page, 2, 4);   // 炮8平5
    const fen = await C.page.evaluate(() => toFEN(G.board, G.turn));
    const txt = await C.page.evaluate(() => moveText());
    assert.match(txt, /炮二平五/);
    assert.match(txt, /炮8平5/, '黑方用阿拉伯数码记谱');
    const after = await C.page.evaluate(t => {
      loadNotation(t);
      return { len: G.history.length, fen: toFEN(G.board, G.turn), init: G.initFen };
    }, txt);
    assert.equal(after.len, 2);
    assert.equal(after.fen, fen);
    assert.equal(after.init, 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
                 '没给 FEN 时从初始局面起步');
  });

  test('首行带 FEN 时从该局面起步', async t => {
    if (!need(t)) return;
    const fen = '4k4/9/9/9/9/3R5/9/9/9/5K3 w - - 0 1';
    const r = await C.page.evaluate(t => {
      loadNotation(t + '\n车六进二');
      return { len: G.history.length, fen: toFEN(G.board, G.turn), init: G.initFen };
    }, fen);
    assert.equal(r.init, fen);
    assert.equal(r.len, 1);
    assert.equal(r.fen, '4k4/9/9/3R5/9/9/9/9/9/5K3 b - - 0 1');
  });

  test('按钮导入中文棋谱，非法的被拒绝且局面不变', async t => {
    if (!need(t)) return;
    await C.page.click('#btnNew'); await C.page.waitForTimeout(150);
    C.page.once('dialog', d => d.accept('1. 炮二平五 炮8平5'));
    await C.page.click('#btnMvImport');
    await C.page.waitForTimeout(150);
    assert.equal(await C.page.evaluate(() => G.history.length), 2);
    assert.match(await C.page.textContent('#toast'), /棋谱已载入（2 手）/);

    const before = await snap(C.page);
    C.page.once('dialog', d => d.accept('炮二平五 车九进七'));   // 第二手非法
    await C.page.click('#btnMvImport');
    await C.page.waitForTimeout(150);
    assert.deepEqual(await snap(C.page), before, '导入失败不应改动局面');
    assert.match(await C.page.textContent('#toast'), /^导入失败：.*第 2 手/);
  });
});

describe('人机与观战', () => {
  test('人机模式 AI 会应手', async t => {
    if (!need(t)) return;
    await C.page.selectOption('#selMode', 'pve');
    await C.page.click('#btnNew'); await C.page.waitForTimeout(200);
    await clickCell(C.page, 7, 7); await clickCell(C.page, 7, 4);
    await C.page.waitForFunction(() => G.history.length >= 2 && !G.thinking, null, { timeout: 25000 });
    assert.equal(await C.page.evaluate(() => G.history.length), 2);
  });

  test('人机悔棋一次退两手', async t => {
    if (!need(t)) return;
    C.pveFen = await C.page.evaluate(() => toFEN(G.board, G.turn));
    await C.page.click('#btnUndo'); await C.page.waitForTimeout(200);
    const s = await snap(C.page);
    assert.equal(s.len, 0);
    assert.equal(s.turn, 'r');
    assert.equal(await C.page.evaluate(() => G.future.length), 2);
  });

  test('人机前进一次还原两手且不再重复走', async t => {
    if (!need(t)) return;
    await C.page.click('#btnRedo');
    await C.page.waitForFunction(() => !G.thinking, null, { timeout: 25000 });
    await C.page.waitForTimeout(300);
    const s = await snap(C.page);
    assert.equal(s.len, 2);
    assert.equal(s.fen, C.pveFen);
  });

  test('观战模式隐藏提示按钮', async t => {
    if (!need(t)) return;
    await C.page.selectOption('#selMode', 'eve');
    await C.page.waitForTimeout(150);
    assert.equal(await C.page.evaluate(() => getComputedStyle(document.querySelector('#btnHint')).display), 'none');
  });

  test('观战中回看会自动暂停', async t => {
    if (!need(t)) return;
    await C.page.waitForFunction(() => G.history.length >= 2, null, { timeout: 30000 });
    await C.page.evaluate(() => document.querySelectorAll('#mvBody tr')[0].click());
    await C.page.waitForTimeout(200);
    const r = await C.page.evaluate(() => ({ review: G.review, running: G.eveRunning }));
    assert.ok(r.review !== null, '应进入回看');
    assert.equal(r.running, false, '应自动暂停');
    await C.page.click('#revExit');
    await C.page.waitForTimeout(150);
    assert.equal(await C.page.evaluate(() => G.review), null);
    await C.page.evaluate(() => { G.eveRunning = false; syncControls(); });
  });
});

describe('认输 / 求和 / FEN 校验 / 自然限着', () => {
  before(async () => {
    if (!C) return;
    await C.page.selectOption('#selMode', 'pvp');
    await C.page.click('#btnNew');
    await C.page.evaluate(() => { G.flip = false; renderAll(); render(); });
    await C.page.waitForTimeout(150);
    geo = await boardGeo(C.page);
  });

  test('非法 FEN 被拒绝，局面不变且给出原因', async t => {
    if (!need(t)) return;
    const before = await snap(C.page);
    await C.page.fill('#fenInput', '4k4/9/9/9/9/9/9/9/4P4/4K4 w - - 0 1');   // 红兵在第 9 行
    await C.page.click('#btnFenLoad');
    await C.page.waitForTimeout(120);
    assert.deepEqual(await snap(C.page), before);
    assert.match(await C.page.textContent('#toast'), /^FEN 无效：/);
  });

  test('结构非法的 FEN 也被拒绝', async t => {
    if (!need(t)) return;
    await C.page.fill('#fenInput', '4k4/9/9/9/9/9/9/9/9 w - - 0 1');          // 只有 9 行
    await C.page.click('#btnFenLoad');
    await C.page.waitForTimeout(120);
    assert.match(await C.page.textContent('#toast'), /^FEN 无效：/);
  });

  test('合法 FEN 可以载入', async t => {
    if (!need(t)) return;
    await C.page.fill('#fenInput', '4k4/9/9/9/9/9/9/9/9/5K3 w - - 0 1');
    await C.page.click('#btnFenLoad');
    await C.page.waitForTimeout(150);
    assert.equal(await C.page.evaluate(() => document.querySelectorAll('.piece').length), 2);
    assert.equal(await C.page.evaluate(() => G.history.length), 0);
  });

  test('棋谱导入的初始 FEN 同样校验', async t => {
    if (!need(t)) return;
    const msg = await C.page.evaluate(() => {
      try { loadRecord('XQ1|4k4/9/9/9/9/9/9/9/4P4/4K4 w - - 0 1|'); return 'no-throw'; }
      catch (e) { return e.message; }
    });
    assert.notEqual(msg, 'no-throw');
  });

  test('认输要确认，确认后判负', async t => {
    if (!need(t)) return;
    await C.page.click('#btnNew'); await C.page.waitForTimeout(150);
    await C.page.click('#btnResign'); await C.page.waitForTimeout(80);
    assert.ok(await C.page.evaluate(() => document.querySelector('#offerBar').classList.contains('show')));
    assert.equal(await C.page.evaluate(() => G.status), 'play', '未确认前不应判负');
    await C.page.click('#offerYes'); await C.page.waitForTimeout(120);
    const r = await C.page.evaluate(() => ({status: G.status, winner: G.winner, reason: G.endReason,
      ovl: document.querySelector('#ovl').classList.contains('show')}));
    assert.equal(r.status, 'forfeit');
    assert.equal(r.winner, 'b');
    assert.match(r.reason, /认输/);
    assert.ok(r.ovl, '应弹出终局遮罩');
  });

  test('终局后认输 / 求和按钮禁用', async t => {
    if (!need(t)) return;
    const d = await C.page.evaluate(() => [document.querySelector('#btnResign').disabled,
                                           document.querySelector('#btnDraw').disabled]);
    assert.deepEqual(d, [true, true]);
  });

  test('提和被拒绝则继续对局', async t => {
    if (!need(t)) return;
    await C.page.click('#btnNew'); await C.page.waitForTimeout(150);
    await C.page.click('#btnDraw'); await C.page.waitForTimeout(80);
    assert.match(await C.page.textContent('#offerTxt'), /提和/);
    await C.page.click('#offerNo'); await C.page.waitForTimeout(80);
    assert.equal(await C.page.evaluate(() => G.status), 'play');
    assert.equal(await C.page.evaluate(() => document.querySelector('#offerBar').classList.contains('show')), false);
    assert.equal(await C.page.evaluate(() => myTurn()), true);
  });

  test('提和并同意 → 和棋', async t => {
    if (!need(t)) return;
    await C.page.click('#btnDraw'); await C.page.waitForTimeout(80);
    await C.page.click('#offerYes'); await C.page.waitForTimeout(120);
    const r = await C.page.evaluate(() => ({status: G.status, reason: G.endReason,
      txt: document.querySelector('#turnTxt').textContent}));
    assert.equal(r.status, 'draw');
    assert.match(r.reason, /议和/);
    assert.equal(r.txt, '和棋');
  });

  test('观战模式隐藏认输 / 求和', async t => {
    if (!need(t)) return;
    const d = await C.page.evaluate(() => {
      const m = G.mode; G.mode = 'eve'; syncControls();
      const v = [getComputedStyle(document.querySelector('#btnResign')).display,
                 getComputedStyle(document.querySelector('#btnDraw')).display];
      G.mode = m; syncControls();
      return v;
    });
    assert.deepEqual(d, ['none', 'none']);
  });

  test('人机：AI 处于劣势时接受议和', async t => {
    if (!need(t)) return;
    await C.page.selectOption('#selMode', 'pve');
    await C.page.evaluate(() => newGame(INIT_FEN));
    await C.page.waitForTimeout(150);
    const r = await C.page.evaluate(async () => {
      const orig = window.analyze;
      window.analyze = async () => ({move: null, score: 600});    // 红大优 → AI（黑）劣势
      requestDraw();
      await new Promise(res => setTimeout(res, 250));
      window.analyze = orig;
      return {status: G.status, reason: G.endReason};
    });
    assert.equal(r.status, 'draw');
    assert.match(r.reason, /议和/);
  });

  test('人机：AI 占优时拒绝议和', async t => {
    if (!need(t)) return;
    await C.page.evaluate(() => newGame(INIT_FEN));
    await C.page.waitForTimeout(150);
    const r = await C.page.evaluate(async () => {
      const orig = window.analyze;
      window.analyze = async () => ({move: null, score: -600});   // 黑大优
      requestDraw();
      await new Promise(res => setTimeout(res, 250));
      window.analyze = orig;
      return {status: G.status, toast: document.querySelector('#toast').textContent};
    });
    assert.equal(r.status, 'play');
    assert.match(r.toast, /不同意和棋/);
    await C.page.selectOption('#selMode', 'pvp');
    await C.page.evaluate(() => newGame(INIT_FEN));
  });

  test('自然限着计数随走子显示', async t => {
    if (!need(t)) return;
    await C.page.evaluate(() => newGame(INIT_FEN));            // 回到完整初始局面
    await C.page.waitForTimeout(150);
    assert.match(await C.page.textContent('#repInfo'), /自然限着 0\/120/);
    await clickCell(C.page, 9, 7); await clickCell(C.page, 7, 6);
    assert.match(await C.page.textContent('#repInfo'), /自然限着 1\/120/);
    assert.match(await C.page.inputValue('#fenInput'), / 1 \d+$/);
  });
});

describe('键盘与移动端', () => {
  test('方向键移动光标、Esc 取消选择', async t => {
    if (!need(t)) return;
    await C.page.evaluate(() => { G.cursor = null; G.selected = null; renderMarks(); });
    await C.page.keyboard.press('ArrowUp');
    await C.page.keyboard.press('ArrowRight');
    const c = await C.page.evaluate(() => G.cursor);
    assert.ok(typeof c === 'number' && c >= 0 && c <= 89, 'cursor=' + c);
    await C.page.keyboard.press('Escape');
    assert.equal(await C.page.evaluate(() => G.selected), null);
  });

  test('输入框聚焦时不拦截按键', async t => {
    if (!need(t)) return;
    const before = await C.page.evaluate(() => G.history.length);
    await C.page.click('#fenInput');
    await C.page.keyboard.type('uuu');
    assert.equal(await C.page.evaluate(() => G.history.length), before, '不该触发悔棋');
    await C.page.evaluate(() => document.querySelector('#fenInput').blur());
  });

  test('F 键翻转两次回到原朝向', async t => {
    if (!need(t)) return;
    const before = await C.page.evaluate(() => G.flip);
    await C.page.keyboard.press('f'); await C.page.waitForTimeout(80);
    await C.page.keyboard.press('f'); await C.page.waitForTimeout(120);
    assert.equal(await C.page.evaluate(() => G.flip), before);
  });

  test('移动端布局不横向溢出且可触屏走子', async t => {
    if (!need(t)) return;
    const m = await C.browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const merr = [];
    m.on('pageerror', e => merr.push(e.message));
    await m.goto(INDEX_URL);
    await m.evaluate(() => localStorage.clear());
    await m.reload();
    await m.waitForFunction(() => typeof G !== 'undefined');
    const layout = await m.evaluate(() => ({
      ovf: document.documentElement.scrollWidth > window.innerWidth + 1,
      w: document.querySelector('#board').getBoundingClientRect().width,
      win: window.innerWidth
    }));
    assert.equal(layout.ovf, false, JSON.stringify(layout));
    assert.ok(layout.w > 200 && layout.w <= layout.win);
    const g2 = await boardGeo(m);
    await m.evaluate(() => { G.mode = 'pvp'; G.flip = false; syncControls(); newGame(); });
    const tap = async (vr, vc) => { await m.touchscreen.tap(g2.left + g2.pad + vc * g2.cell, g2.top + g2.pad + vr * g2.cell); await m.waitForTimeout(120); };
    await tap(7, 7); await tap(7, 4);
    assert.equal(await m.evaluate(() => G.history.length), 1);
    await tap(2, 7);
    assert.equal(await m.evaluate(() => G.selected), 25);
    assert.deepEqual(merr, []);
    await m.close();
  });
});

test('全程无 JS 报错', async t => {
  if (!need(t)) return;
  assert.deepEqual(errors(), []);
});
