# 中国象棋

单文件网页象棋：`index.html`（无依赖、无构建，双击用浏览器打开即玩）。

## 结构

`index.html` 内联三段，按此顺序：

| 段 | 内容 |
|---|---|
| `<style>` | 全部样式（CSS 变量 `--cell` 驱动棋盘与棋子尺寸） |
| `/*<ENGINE>*/ … /*</ENGINE>*/` | **纯函数引擎**：走法生成、将军判定、FEN、中文棋谱、长打裁决、评估与搜索。**禁止引用 DOM** |
| 其余 `<script>` | 状态机 `G`、渲染、交互、计时、音效、存档 |

引擎段保持无 DOM，才能被 Node 直接抽取单测。

## 关键约定

- 棋盘 `board[90]`，`idx = row*9 + col`；row0 = 黑方底线（上），row9 = 红方底线（下）。
- 棋子字符：红 `K A B N R C P`（帅仕相马车炮兵），黑为小写。空 = `null`。
- 走子：`makeMove(bd,m)` / `unmakeMove(bd,m)` 成对；`legalMoves` 会试走过滤自杀着。
- FEN：`toFEN(bd,turn,half,full)`（half/full 可省，默认 `0 1`）；`fromFEN` 做结构校验（10 行 × 9 列、合法字符、走子方）并返回 `{board,turn,half,full}`；`fenIssues(bd,turn)` 做局面校验（兵行范围 / 士象将九宫 / 子力上限 / 非走子方不得被将），返回错误数组。
- 模式 `G.mode`：`pve` 人机 / `pvp` 双人 / `eve` AI 互殴观战。
- 终局 `G.status`：`checkmate` `stalemate` `forfeit` `draw` `timeout`；`isGameOver()` 是纯函数，别往里塞副作用。
- `G.half` 是自然限着计数（距上次吃子的手数），由 `halfmoveClock(initFen, history)` 从棋谱重算，**不进存档**；undo/redo/载入天然一致。
- `G.offer` = `{kind:'resign'|'draw', by:'r'|'b'}` 认输确认 / 提和应答，横幅 `#offerBar` 呈现；`resetMeta()` 清空。
- 交互态：`G.selected/targets` 选中、`G.cursor` 键盘光标、`G.drag` 拖拽、`G.hint` 提示着法、`G.future` 前进栈、`G.review` 棋谱回看手数（`null` = 实时）。
  - `G.gen` 是局面世代号，`resetMeta()`（新局 / 存档载入 / 棋谱导入）会 +1；`maybeAI()` 与 `requestHint()` 在 await 之后比对世代号，不一致就丢弃结果——否则在算的旧着法会落到新局面上（AI 连走两步）。
  - `G.review !== null` 时 `myTurn()` 恒 false、`renderStatus()` 走回看分支、计时暂停；`G.board` 被替换为 `boardAtPly()` 的重放结果，任何改局面的操作都要先 `exitReview()`。
  - `resetMeta()` 统一清空 `future/review/hint/cursor/selected/drag`，`newGame/load/loadRecord` 都调它。

## 棋规要点（已实现，勿退化）

- 蹩马腿、塞象眼、炮翻山、兵过河、兵不后退、九宫限制。
- **将帅照面**等价于被将军：`isChecked` 里两将同列无挡子即算将军。
- **困毙判负**（象棋规则，非国象和棋）。
- **60 回合自然限着作和**：`halfmoveClock` 计数（只有吃子清零，兵推进不清零），连续 120 半回合无吃子 → `draw`；杀 / 困毙优先。
- **长打判负**：`classifyMove(bd, h)` 传的是**走子前**的局面（`repetitionVerdict` 维护 `boards[]`），每手分类为
  `check` 主动将 / `counter` 解将反将 / `parry` 解将 / `mate` 杀 / `chase` 捉 / `exch` 兑 / `offer` 献 / `block` 拦 / `follow` 跟 / `idle` 闲。
  「打」= `DA_TAGS` = 将/反将/杀/捉；**解将不算打**。单方长将（只看 `check`）→ 判负；单方长打、对方非长打 → 判负；
  双方同属长打或均无犯例（长兑 / 长献 / 长拦 / 长跟 / 长闲）→ 三次重复作和。
- `捉` 以 `see()`（静态兑换评估，含根子保护与多子捉一子）净得子为准；净得 0 记「兑」，盯有根子记「跟」，送吃记「献」，切断对方车线记「拦」。

## 交互功能

- 走子：点击（选中 → 落点）与拖拽并存。`pointerdown` 总是记录 `G.drag`（含不可拖的情况），`pointerup` 一律走 `dragEnd()`；位移 < 4px 视为点击，否则拖动态，松手命中 `G.targets` 才走子、否则回弹。
- 棋谱：点行/点格进入回看（`G.review`），`‹ ›` 翻手，「返回当前」退出；回看时棋盘加 `.reviewing` 且不计时。
- 前进：`undo` 把弹出项压入 `G.future`，`redo` 出栈重放（pve 一次两手）；新走子会清空 `G.future`。
- 提示：`analyze()`（引擎段纯函数）返回 `{move,score}`，`G.hint` 高亮起讫；观战模式隐藏该按钮。
- 评估条：`evaluate()` 分数经 logistic 映射成红方占比，`render()` 里刷新。
- 存取：中文记谱文本（复制）+ 紧凑串 `XQ1|初始FEN|from.to,…`（导出/导入，`parseRecord` 校验每着合法）。
  导入按钮两种都吃：`XQ1|` 开头走 `loadRecord()`，否则当中文棋谱走 `loadNotation()`——`notationTokens()` 抽着法（容忍手数/标点/废话），
  `parseNotation()` 拆出 `{name,ptype,only,prefix,fromFile,act,arg}`，`notationHit()` 拿它去比对 `legalMoves()`（结构匹配，不自己算落点，所以平/进/退、纵线号与步数两套参数、前/后/中都走同一条路）。
  `notationMoves(fen, text)` 是 `notation()` 的逆运算，返回 `[{from,to,…}]`，首行可以是 FEN（缺省初始局面）；异方着法 / 非法着法 / 歧义都 throw 并带上手数。
- FEN 载入 / 棋谱导入 / 存档载入共用 `validateFen(fen)` = `fromFEN` 结构校验 + `fenIssues` 局面校验，不合法直接拒绝并 toast 首条原因（局面保持不变）。
- 认输 / 求和：`#btnResign` / `#btnDraw`（终局禁用、观战隐藏）。认输需横幅二次确认；提和在 `pvp` 由对方同意/拒绝，在 `pve` 由 `aiDrawReply()` 按 `analyze()` 分数应答（AI 不吃亏才和）。
- 快捷键：方向键/回车/Esc/H/U/R/F/N，输入框聚焦时不拦截。

## 测试

游戏本身无构建、无运行时依赖；`package.json` / `node_modules` 只服务于测试。

```
npm i                # 装 playwright-core（唯一 devDependency）
npm test             # 引擎单测 + 浏览器集成（103 项）
npm run test:engine  # 只跑引擎（纯 Node，无需浏览器）
npm run test:browser # 只跑浏览器
```

| 文件 | 作用 |
|---|---|
| `tests/engine.mjs` | 抽取 `/*<ENGINE>*/` 段成临时 ESM 供 import（引擎段若有 DOM 引用这里会直接报错） |
| `tests/engine.test.mjs` | 引擎单测：perft、棋规、FEN/局面校验、自然限着、棋谱、中文棋谱解析、SEE 与长打裁决、搜索 |
| `tests/browser.mjs` | 找本机浏览器 + 载入 playwright-core；两者缺一则整体 skip |
| `tests/browser.test.mjs` | 浏览器集成：走子/拖拽、AI、悔棋前进、提示、回看、导出导入、中文棋谱导入、存档、观战、认输求和、FEN 校验、键盘、移动端 |

- perft 44 / 1920 / 79666 / **3290240** 是走法生成的权威校验，改引擎后必跑 `npm run test:engine`。
- 浏览器测试用真实时间，**不要** `--virtual-time-budget`：AI 搜索的 `setTimeout(0)` 链会把虚拟时钟锁死。
- 找不到浏览器时用 `XIANGQI_CHROME=/path/to/browser npm run test:browser` 指定。
- 坑：`G` 是 classic script 里的 `const`，不在 `window` 上，`page.evaluate` 里直接用标识符 `G`，别写 `window.G`。

页面带 `?test=1` 会跑内置 perft 自测并把结果写到 `window.__XIANGQI_TEST__`。

## 改代码时注意

- 不要用 Web Worker：`file://` 下 Chrome 会拦截 Blob Worker，AI 走主线程时间预算 + 迭代加深。
- 音效全部用 Web Audio 实时合成，不要引入音频文件（要保持单文件）。
- 移动端：棋盘尺寸由 `layout()` 按 `window.innerWidth/innerHeight` 算，**不要**读 `boardcol.clientWidth`（会造成循环依赖，棋盘会缩到最小）。
