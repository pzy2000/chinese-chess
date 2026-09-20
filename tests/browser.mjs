// 浏览器集成测试的脚手架：找浏览器 + 载入 playwright-core，都失败则跳过。
// 真实时间驱动，**不要**用 --virtual-time-budget（AI 的 setTimeout(0) 链会锁死虚拟时钟）。
//
//   node --test tests/browser.test.mjs
//   XIANGQI_CHROME=/path/to/browser node --test tests/browser.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const INDEX_URL = pathToFileURL(path.resolve(HERE, '..', 'index.html')).href;

function findBrowser(){
  if (process.env.XIANGQI_CHROME) return process.env.XIANGQI_CHROME;
  const cands = [];
  const pwCache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(pwCache)){
    for (const d of fs.readdirSync(pwCache)){
      if (!/^(chromium|chrome)/.test(d)) continue;
      for (const rel of [
        'chrome-headless-shell-mac-arm64/chrome-headless-shell',
        'chrome-headless-shell-mac-x64/chrome-headless-shell',
        'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
      ]){
        const p = path.join(pwCache, d, rel);
        if (fs.existsSync(p)) cands.push(p);
      }
    }
  }
  cands.push(
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
  );
  return cands.find(p => fs.existsSync(p)) || null;
}

async function importPlaywright(){
  for (const spec of ['playwright-core', 'playwright']) {
    try { return await import(spec); } catch {}
  }
  return null;
}

// 返回 null 表示环境不具备（调用方应 skip 而不是 fail）
export async function openBrowser(){
  const exe = findBrowser();
  const pw = await importPlaywright();
  if (!exe || !pw) return null;
  const browser = await pw.chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(INDEX_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // 注意：G 是 classic script 里的 const，只存在于全局词法环境，不挂在 window 上
  await page.waitForFunction(() => typeof G !== 'undefined' && typeof render === 'function');
  return { pw, browser, page, errors, close: () => browser.close() };
}
