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
- 模式 `G.mode`：`pve` 人机 / `pvp` 双人 / `eve` AI 互殴观战。
- 终局 `G.status`：`checkmate` `stalemate` `forfeit` `draw` `timeout`；`isGameOver()` 是纯函数，别往里塞副作用。

## 棋规要点（已实现，勿退化）

- 蹩马腿、塞象眼、炮翻山、兵过河、兵不后退、九宫限制。
- **将帅照面**等价于被将军：`isChecked` 里两将同列无挡子即算将军。
- **困毙判负**（象棋规则，非国象和棋）。
- **长打判负**：每手分类为 `将/杀/捉/闲`；单方长将 → 判负；单方长打、对方非长打 → 判负；双方同属长打或均无犯例 → 三次重复作和。`捉` 需净得子，等价交换算「兑」不算捉。

## 测试

无构建流程，用 Node 抽取引擎段 + headless Edge（CDP 真实时间）跑：

- 引擎单测（73 项）：perft 44 / 1920 / 79666 / **3290240** 是走法生成的权威校验，改引擎后必跑。
- 浏览器集成（63 项）：点击走子、AI 应手、悔棋、存档、长打判决、观战模式。

headless 不要用 `--virtual-time-budget`：AI 搜索的 `setTimeout(0)` 链会把虚拟时钟锁死，改用 CDP 驱动真实时间。

页面带 `?test=1` 会跑内置 perft 自测并把结果写到 `window.__XIANGQI_TEST__`。

## 改代码时注意

- 不要用 Web Worker：`file://` 下 Chrome 会拦截 Blob Worker，AI 走主线程时间预算 + 迭代加深。
- 音效全部用 Web Audio 实时合成，不要引入音频文件（要保持单文件）。
- 移动端：棋盘尺寸由 `layout()` 按 `window.innerWidth/innerHeight` 算，**不要**读 `boardcol.clientWidth`（会造成循环依赖，棋盘会缩到最小）。
