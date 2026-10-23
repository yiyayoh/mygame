# 交接文档：《第七间教室》

> 写给接手这个项目的 AI 助手或开发者。请先完整读完本文，再读 `docs/DESIGN.md`（剧情设计，含全部剧透），然后再动代码。

---

## 1. 项目是什么

一款在浏览器里玩的**中文社会派文字推理游戏**，风格参考东野圭吾。

- 仓库：`https://github.com/yiyayoh/mygame`，主分支 `main`
- 纯静态网页：HTML + CSS + 原生 JavaScript（ES Module），**没有框架，没有构建步骤，没有运行时依赖**
- 当前内容：序章 + 五章 + 终章，正文约 3 万字，48 条线索，6 轮推理，2 个结局，预估通关约 3 小时

## 2. 用户是谁、想要什么（务必遵守）

用户用中文交流，回复请用中文。

用户的偏好是在这几轮对话里逐步明确的：

1. **最初想做 galgame，后来放弃了。** 原因是没有二次元立绘：用代码画的立绘被用户评价为「太抽象了，吓我一跳」。
   **不要再尝试用代码或 SVG 生成人物立绘、人物插画。** 这条路已经被否定了。
   画面上的氛围靠排版、配色、雨的动画和文字本身来营造。
2. **要悬疑、反转、探案浓厚，参考东野圭吾。**
3. **比起本格推理，更偏爱社会性推理**，着重写人性和社会问题。目前涉及：
   - 教育体制和学校的利益
   - 临时工、留守儿童等底层处境
   - 网络暴力和流量
   - 体制内的沉默
   - 「干净的手」不会被审判
4. **目标游玩时长约 3 小时。**

写作风格：克制、细节化、不煽情却让人难受。没有纯粹的坏人，每个做错事的人都有自己的处境和理由；结局不给痛快的报应。
现有文本的语气请保持一致，动笔前先读几段现有剧本。

## 3. 目录结构

```
index.html              页面骨架：标题画面、章节卡、结局画面、主界面、线索本弹窗
css/style.css           全部样式（暗色 + 灯光黄的配色，变量定义在 :root）
js/engine.js            游戏引擎（约 500 行）
js/rain.js              雨丝动画（canvas）+ Web Audio 合成的雨声
assets/favicon.svg      网站图标；部署时需一并复制 assets/
js/story.js             剧本入口：合并各章数据，导出 START / CLUES / PROFILES / SCENES / HUBS / DEDUCTIONS / WRONG_LINES
js/story/clues.js       全部线索（CLUES）与人物档案（PROFILES）
js/story/ch1.js         序章「雨」+ 第一章「现场」
js/story/ch2.js         第二章「自白」
js/story/ch3.js         第三章「她的海」
js/story/ch4.js         第四章「雨声」（含寻找白芷、录音）
js/story/ch5.js         第五章「沉默的人们」+ 终章 + 两个结局
docs/DESIGN.md          剧情设计：主题、人物、真相、时间线、章节结构（全剧透）
docs/HANDOFF.md         本文档
tests/validate.mjs      剧本数据静态校验
tests/playthrough.mjs   Playwright 浏览器自动通关测试
tests/experience.mjs    阅读恢复、旧存档、界面操作回归检查
tests/server.mjs        供预览和测试使用的 Node 静态服务器
package.json            只有 devDependency: playwright；npm test = 校验 + 通关
.github/workflows/deploy.yml   push 到 main → 跑测试 → 部署到 GitHub Pages
```

## 4. 运行与测试

```bash
# 本地运行（必须走 HTTP，因为用了 ES Module）
npm start
# 打开 http://localhost:8000
# 加上 ?fast 参数会跳过打字机效果和动画：http://localhost:8000/?fast

# 剧本静态校验（不需要安装任何东西，几秒钟）
node tests/validate.mjs

# 完整测试：校验 + 浏览器自动打通两个结局（需要 Playwright + Chromium）
npm install
npx playwright install chromium
npm test
# 可选：把每章的截图存到某个目录
node tests/playthrough.mjs ./shots
```

**每次改完剧本都必须跑 `node tests/validate.mjs`，提交前跑 `npm test`。**

当前状态：两个测试全部通过，「17 个场景，6 个调查，6 轮推理，48 条线索」，两个结局都能完整打通，读档正常，无页面报错。

2026-10-23 体验优化：新增阅读恢复、回看、筛选和设置回归检查。本地测试可用环境变量 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已安装的 Chrome；不设置时照常使用 Playwright Chromium。测试服务器使用随机端口，不依赖 Python。

## 5. 剧本数据格式（最重要）

所有内容都是 `js/story/*.js` 里的 JS 对象，引擎完全由数据驱动。**改剧情不需要碰 engine.js。**

### 5.1 台词（lines 数组里的元素）

```js
'旁白文字',                          // 叙述，第一人称「我」= 主角夏川
'【宋小满】角色台词',                 // 角色发言，显示为名字 + 「」包裹的台词
'【我】主角台词',                     // 显示名为「夏川」，用灯光黄色
'【周慕白（录音）】……',              // 名字里含「录音」会用绿色调显示
{ clue: 'wounds' },                   // 获得线索（重复获得会被忽略）
{ title: '第一章', sub: '现场' },     // 全屏章节标题卡，同时会清空正文区
```

注意：字符串里不要用 ASCII 单引号（会破坏 JS 字符串），引号统一用「」。

### 5.2 场景 SCENES

```js
sceneId: {
  lines: [...],
  // 以下五选一，决定播完之后去哪：
  next: 'otherScene',
  hub: 'hubId',                       // 进入调查
  deduction: 'dId',                   // 进入推理
  choices: [{ text: '选项文字', to: 'sceneId' }, ...],
  ending: { name: '真相结局', sub: '副标题' },   // 显示结局画面
}
```

### 5.3 调查 HUBS

```js
hubId: {
  chapter: '第三章　她的海',           // 顶栏显示
  when: '周一 上午',
  intro: '进入调查时显示的一句引导',
  locations: [
    { id, name, note, items: [ { id, name, requires?: [clueId], lines: [...] } ] },
  ],
  people: [
    { id, name, role,
      talks: [ { id, name, requires?: [clueId], lines: [...] } ],
      present: { clueId: [...lines] },  // 向此人出示某条线索时的反应；没写的线索有默认台词
    },
  ],
  goal: { requires: [clueId...], deduction: 'dId' },
  // 或者：goal: { requires: [...], scene: 'sceneId', label: '去东堤！' }  直接进入剧情
}
```

- `requires` 没满足的条目不会显示。一个地点或人物下面如果没有任何可用条目，按钮会变灰，显示「还没有头绪」。
- 底部显示「关键线索 x / y」，凑齐 `goal.requires` 后出现进入推理（或剧情）的按钮。
- **有些关键线索只能靠「出示」拿到**（比如向顾明远出示他的伞、向林晓出示 18:41 的照片、向郑校长出示老孙的笔记）。
  这是核心玩法，但要在台词里给出足够暗示，避免玩家卡关。

### 5.4 推理 DEDUCTIONS

```js
dId: {
  title: '推理 Ⅲ　被压下的声音',
  questions: [
    // 单选
    { q: '问题', options: ['A', 'B', 'C'], answer: 1, right?: [...lines], wrong?: [...lines] },
    // 出示证据（数组里任意一条都算对）
    { q: '出示证据。', clue: ['clueA', 'clueB'], right?: [...] },
    // 时间线排序：按「正确顺序」书写，界面上会随机打乱
    { q: '按先后顺序排列。', order: ['事件1', '事件2', ...], right?: [...] },
    // 多选：answer 为所有正确选项的下标，必须完全一致才算对
    { q: '选出所有……', multi: ['A', 'B', 'C', 'D'], answer: [0, 2], right?: [...] },
    // 没有标准答案：选任何一项都算对，replies[i] 是选第 i 项后的回应
    { q: '……值得被原谅吗？', options: [...], answer: 'any', replies: [[...], [...], [...]], right?: [...] },
  ],
  done: 'sceneId',      // 全部答完后进入的场景
}
```

答错会让失误次数 +1，搭档宋小满会吐槽一句（`WRONG_LINES`，轮流出现），然后可以重答。
题目可用 `wrong` 提供针对题意的反馈。事实核对题要明确问已证实的行为；个人态度题使用 `answer: 'any'`，不要把「你认为」写成有唯一标准组合的题目。
结局画面按失误次数给评价：0 次「名侦探」，≤3「敏锐的刑警」，≤8「刑警」，更多「新人刑警」。

### 5.5 线索与人物档案（clues.js）

```js
CLUES = { id: { name: '短标题', type: '现场|尸检|物证|证词|照片|档案|网络', text: '详细描述' } }
PROFILES = { id: { name, role, entries: [ { requires: [clueId], text: '一句话' } ] } }
```

人物档案在线索本的第二个分页，每条记录在拿到对应线索后才显示。**注意别让档案提前剧透**：解锁条件应该是「玩家已经知道这件事」时才会拿到的线索。

### 5.6 当前的流程图

```
prologue → ch1_arrive → [hub1] → d1 → ch1_end → ch1_widow
→ ch2_open → [hub2] → d2 → ch2_end
→ ch3_open → [hub3] → d3 → ch3_end
→ ch4_open → [hub4a 寻找白芷] → ch4_found → ch4_night → [hub4] → d4 → recording → d5 → ch4_after
→ ch5_open → [hub5] → d6 → finale → 选择 → ending_truth / ending_silence
```

## 6. 引擎要点（engine.js）

- 状态对象保留原有字段，并新增 `version: 2`、`history[]`、`logStart`、`playback`、`sceneComplete`、`chapter`、`when`。`playback` 保存正在阅读的台词列表、当前索引、当前句是否显示以及播放后的动作。
- 每一步操作后自动存档到 localStorage：`seventh-classroom/save`；已达成的结局存在 `seventh-classroom/endings`
- 新存档会恢复当前句和最近正文，调查、出示回应及答题反馈中途读档也会接续，完成行动和计分仅执行一次。打字中读档会完整显示当前句，仍需继续操作才到下一句。
- 旧存档仍兼容，但无法补回原来没保存的正文；旧的剧情存档首次加载仍从当前场景开头开始记录。
- 「回看」保留已读的跨章正文，章节卡只清空主阅读区，不删除回看。结局后仍按原规则清除可继续的存档。
- 打字速度默认 32 毫秒/字，可在设置里选慢、标准、快、整句；字号可选默认或 16/18/20/22。设置存在独立的 `seventh-classroom/settings` 中。
- 点击正文或按空格、回车：正在打字时显示整句，打完后进入下一句；弹窗中不会误推进正文。雨声开关已移入设置，默认仍关闭。
- `?fast` 参数：打字和等待全部变成 0，供自动化测试用
- 所有可点击的元素都带 `data-*` 属性（`data-option`、`data-clue`、`data-goal`、`data-action`、`data-target`、`data-present`、`data-order-item`、`data-confirm`、`data-choice`、`data-tab`、`data-back`），**自动通关测试依赖这些属性，改界面时请保留**
- 结局总数「（共 2 个）」是写死在 `showTitle()` 里的字符串，加结局时要一起改

## 7. 测试脚本在检查什么

`tests/validate.mjs`：
- 所有线索、场景、调查、推理之间的引用都存在
- 题目格式合法（answer 下标不越界、replies 数量和选项一致等）
- **沿主线模拟**：在每个调查里反复执行所有可用行动和出示，确认 `goal.requires` 都拿得到，推理题需要的证据此时都已到手
- 每条线索在主线中都能拿到（不允许有拿不到的死线索）

`tests/playthrough.mjs`：
- 启动 Node 本地服务器，用 Chromium 打开 `?fast`，像玩家一样一路点到结局
- 先调用 `tests/experience.mjs`：验证旧存档、当前句和调查/出示/答题反馈恢复、跨章回看不提前剧透、搜索筛选、提示不扣分、设置持久化及 320/390 像素小屏
- 第一个推理故意答错一次，并验证结局显示「推理失误：1 次」
- 进入第三章调查时刷新页面，测试「继续调查」读档
- 第一遍桌面尺寸选真相结局，第二遍手机尺寸（390×844）选沉默结局
- 任何页面报错都算失败

新增功能时，如果用了新的题型或交互，**记得同步更新 playthrough.mjs 的自动答题逻辑**。

## 8. 没做过、没验证过的事（诚实说明）

- **GitHub Pages 还没有启用。** 需要用户到仓库 Settings → Pages 把 Source 设为「GitHub Actions」。
- **`.github/workflows/deploy.yml` 从来没有在 GitHub 上真正跑过。** 之前的开发环境无法触发 Actions，第一次运行时请检查日志。
  其中 `npx playwright install --with-deps chromium` 这一步最可能出问题。
- **「约 3 小时」是估算，不是实测。** 估算依据：约 3 万字正文按每分钟 250 字左右的阅读速度，再加 6 轮推理和调查的操作时间。没有真人完整玩过。
- **没有真人试玩反馈。** 难度、节奏、文字质量都只经过作者自检和自动化测试。
- 字体从 Google Fonts 加载 Noto Serif SC，网络不通时会回退到系统宋体。

## 9. 已知的不足 / 可以改进的方向

按优先级大致排序：

1. **回看和正文恢复已完成**：仍需真人试玩确认阅读节奏。新功能无法追溯补回旧存档没有记录的文字。
2. **阅读设置已完成**：支持字号与打字速度；自动播放尚未实现。
3. **操作提醒已完成**：「调查没有进展？」只提示查看未读项目或出示线索，不给具体答案，不扣评价。更具体的分级谜题提示尚未实现。
4. **「出示」的引导已加强**：人物按钮明确写「话题已问完 · 仍可出示线索」，部分关键回应补充操作暗示。仍需真人首次试玩确认难度。
5. **重复总结已局部删减**：第三、四章结尾减少复述，第五章把责任讨论前的多选题改为证据核对；剧情事实和结局未改动。补充谈话可用 `optional: true` 标明不影响推进。
6. **新玩法**（第一版时用户表示过兴趣）：
   - 证言对质：逐句质证，找出证词里矛盾的那一句。
   - 更复杂的时间线拼图。
7. **音效**：现在只有合成雨声。可以加脚步声、开门声、上课铃等，也用 Web Audio 合成，不需要音频文件。
8. **第二个案子**：顾明远、林晓、老孙、赵队都可以作为新故事的线索人物。

## 10. 修改时的注意事项

- **不要改动已经成立的事实**，要改先对照 `docs/DESIGN.md` 的时间线。关键事实：
  - 案发 2026-10-09（周五）；白芸死于 2025-10-11（周六）台风夜。
  - 18:07 是白芸最后那通电话的时间，也是「第七间教室」每周五亮灯的时间。
  - 两处头部伤相隔至少 20 分钟。白芷 18:16 离开，陈伯 18:31 进入，周慕白约 18:40 死亡。
  - 陈伯几乎不识字，黑板上的字是照着白芸笔迹描出来的。
  - 赵队 2015 年改写的渔船事故报告，遇难者里有白家姐妹的父亲。
- **新增线索后**：如果它是推进剧情所必需的，要放进某个 `goal.requires`；不必需的线索也必须在主线中拿得到，否则 validate 会报错。
- **新增章节**：在 `js/story/` 新建文件，导出 `SCENES / HUBS / DEDUCTIONS`，在 `js/story.js` 的 `chapters` 数组里加上。各章之间的 id 不能重复。
- **id 命名**：调查条目的 id 在同一个 hub 内要唯一（已完成的条目以 `hubId:itemId` 记录在 `state.done` 里）。
- **提交前**：`node tests/validate.mjs` 和 `npm test` 都要通过。

## 11. 项目历史

| 提交 | 内容 |
|---|---|
| `9362e42` | 最初的 WebGAL galgame 版本（校园恋爱 + 悬疑） |
| `7fa6845` | 尝试用 SVG 绘制日系立绘，被用户否定 |
| `037511d` | 推倒重来，改为自制引擎的文字推理游戏，约 1 小时 |
| `bd65a37` | 扩写为约 3 小时的社会派推理，新增第三、五章和三种推理题型 |

旧的 galgame 文件在第一、二个提交里，已经从当前代码中删除。不需要恢复。
