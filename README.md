# Word Island · 单词岛屿

一个把「背单词」做成冒险游戏的 Web 应用：答题即战斗、答对即奖励，用金币和经验建设自己的岛屿，把掌握的单词种进词汇花园。

项目基于 Next.js 16 App Router + React 19 + PostgreSQL（Drizzle ORM）+ Tailwind 4，全部数据落在真实数据库里，附带 56 个单元/集成测试。

---

## 功能亮点

- **9 种题型**：英译中、中译英、拼写挑战、语境选择、听音辨词、同义辨析、反义匹配、句子构建、纯拼写（听写）。
- **纯拼写听写模式**：学习页新增的第四种学习方式，循环流程——①「盲拼」：只播放发音，界面只有一条输入线；②拼完按 `Enter` 检查，连续字母逐位标色（对=绿 / 错=红）并展示音标释义；③「跟拼」：单词以连续阴影显示，只有输入正确的字母才会前进点亮，输错不前进并提示；④再回到盲拼，如此交替直到拼对，展示完整单词详情后进入下一个。第一遍的作答结果会记入间隔复习（SRS），后续拼对不重复发奖。
- **账号系统**：注册 / 登录（scrypt 加盐哈希 + HttpOnly 会话 Cookie），未登录访问自动跳转登录页。每个账号拥有**完全独立**的词库、学习进度、岛屿、花园与成就；第一个注册的账号自动成为管理员，并接管升级前遗留的单人数据。
- **后台管理**：`/admin` 管理员专属——查看所有账号（等级 / 金币 / 词量 / 已学 / 掌握）、创建账号、重置密码（重置后强制下线）、删除账号（级联清理全部数据）。普通用户侧边栏不出现入口，服务端二次鉴权。
- **答题节奏优化**：答对后只显示一行简要反馈（单词 + 释义 + 奖励）并在约 1 秒后自动进入下一题，不再每题弹出完整反馈卡；答错时保留完整反馈卡供巩固记忆，按 `Enter` 或点「继续」进入下一题。顶部进度条与「N / 总数」计数保持一致。
- **间隔复习（SRS）**：每次答题都会更新熟练度与下次复习时间，状态分为「未学习 → 学习中 → 复习中 → 已掌握」。
- **群岛探索**：6 个区域（沙滩 / 森林 / 神秘遗迹 / 港口 / 山脉 / 远洋群岛），按等级、已学词数或道具解锁；每次探索 6–8 个事件，包含怪物、首领、NPC、宝箱、营地、漂流瓶与石碑。
- **场景化战斗（P0 + P1）**：`/map` 的探索默认进入 Canvas 2D 战斗场景——题干挂在木牌上，答案变成可**拖拽到怪物法阵**的「词贝」；命中时有粒子爆发、镜头推进与屏幕震动，结算时撒落彩带，战后用石碑展示单词释义、例句与奖励。HUD 上的 `场景 / 简洁 / 极速` 三档可随时切换，选择记在 `localStorage`：
  - `场景`（默认，P1）：Canvas 渲染循环 + 粒子系统 + 拖拽命中检测，零新增运行时依赖。
  - `简洁`（P0）：SVG + DOM 词贝，用于读屏、低性能设备或 Canvas 降级。
  - `极速`：原生卡片式答题，适合快速刷题。
  
  三档共用同一套 `resolveEventAction` 服务端逻辑，答题、奖励与 SRS 结果完全一致；Canvas 层 `aria-hidden`，另有一组 `sr-only` 按钮供键盘 / 读屏使用。
- **立体世界（P2）**：`/island` 和 `/garden` 默认进入可旋转的低多边形 3D 场景——拖拽转视角、滚轮缩放、昼夜与晴/雨/雪切换；岛屿有沙崖、草地、按类型建模的建筑、散步的居民与产出光点；花园是一整块土台，单词按熟练度长成 `seed → bloom`，可拖动植株重新摆放（位置只存本机浏览器）。两页都保留 `立体 / 平面` 切换，平面档就是原来的 SVG 岛屿 / 卡片网格。
- **成长闭环**：金币 / 经验 / 连击奖励 → 岛屿建造与商店道具 → 解锁新区域；答错的单词自动排入复习队列。
- **单词发音本地缓存**：导入单词 / 注册账号时自动预取有道词典的高品质发音并存入数据库（`word_audio` 表），播放走同源 `/api/tts` 接口——**本地缓存优先、离线可用**；未命中的词自动回源并回存，上游不可用时回退系统 TTS。后台管理提供「补齐全部发音」一键补齐存量单词（多词短语有道无录音，自动回退系统 TTS）。
- **书屿 · 每日三读**：`/reading` 阅读练习模块，每天惰性生成三个槽位的推送（沿用全站「请求时按日期计算」的模式，无需定时任务），每个槽位都可「换一篇」：
  - **精读 · 学以致用**：按文章词汇索引与学习词的覆盖度打分（本周新学词 ×5、学习中词 ×3、主题接近「遗忘」笔记加权、难度惩罚），推荐理由会写明命中了几个正在学的词。
  - **泛读 · 拓展视野**：难度匹配滚动阅读水平（最近 5 篇完成文章的平均难度），主题与最近 3 天去重。
  - **热读 · 今日热点**：The Guardian Open Platform（需 `GUARDIAN_API_KEY`）优先，无 key 自动回退 BBC News；新闻类文章 30 天保质期后不再推送。
  - 文章池来源：The Conversation（CC 许可、Atom 全文）、Guardian / BBC（热点）、后台手动导入（雅思真题等自备素材）。
- **阅读器**：正文逐词渲染，**点词弹词卡**（发音 + 释义：用户词库 → 内置词库 → 免费词典 API 英英兜底，一键「收进拾词」专属词库，难度 3 直接进 SRS 队列）；**划词高亮**（三色持久化）与**划词记笔记**（表达 / 词组 / 语法 / 长难句四类，可附标签与个人理解）；你自己的词在文中自动着色（学习中黄、已掌握绿）。读到末段（或触底）解锁「读完领奖」：+150 金币 +50 XP，写入 `dailyStats`（`articles_read` / `reading_seconds`），防刷门槛为词数 ×0.15s 的最短阅读时长。
- **拾贝笔记（知识库）**：`/notes` 把阅读中划下的笔记按**复现归并**（同一表达的不同词形自动合并计 ×N）聚合成组；**熟悉度三态**（熟悉 / 一般 / 遗忘）一键标记并驱动排序——遗忘 × 高复现排最前，标记「熟悉」沉入折叠区；每条笔记可跳回文章原段落上下文。遗忘笔记的主题会反向加权精读选文，形成「读 → 记 → 复现」闭环。
- **AI 长难句解析（可选）**：配置 `AI_API_KEY` + `AI_BASE_URL`（OpenAI 兼容接口）后，记长难句 / 语法笔记时可一键 AI 拆解主干、从句与翻译，解析结果随笔记存库、在拾贝页复看；未配置时入口自动隐藏，全部功能不依赖 AI。
- **岛屿建造自由度**：建筑支持**移动**（免费换到任意匹配地形空位）与**收进背包**（保留等级，不再打五折返金币），商店新增「背包」区可免费放回、等级保留；小木屋是岛主的家不能收进背包，但同样可以移动。
- **发音缓存覆盖进度**：后台管理展示「已缓存 X/Y」与进度条，全部缓存时绿色标记 ✓；补齐完成后自动刷新统计。
- **岛屿六大玩法**（岛屿页全面翻新，让小岛随学习一起长大）：
  1. **岛屿扩建**：12 个初始槽位之外新增 12 个环带地块，按「等级 + 累计已学词数」解锁（4 级·60 词 → 6 级·150 词 → 8 级·300 词），岛屿物理变大；锁定地块会显示解锁条件，服务端二次校验。
  2. **居民入住**：岛上会散步小人（平面 + 3D 都可见）——1 位原住民 + 每掌握 40 词 +1 位 + 每建 3 座建筑 +1 位（上限 9 位），点一下会冒出台词气泡。
  3. **建筑功能化**：图书馆 = 直达书屿阅读的入口；灯塔 = 每日点亮签到（+25 金币）；风车 = 每日把复习量换算成能量金币（复习次数 ×2，5-60）；花园建筑展示词汇花园已绽放株数并联动跳转。
  4. **岛屿保卫战**：每天第一次上岛惰性刷出 6 波怪物潮（新表 `island_raids`，沿用全站无 cron 模式），怪物挂词题（学习中的词优先，英译中/中译英交替，4 选项干扰项来自你的词库），答对击退 +15 金币、答错扣心，3 心全失失守、全部击退 +60 金币 +40 XP。
  5. **群岛体系**：按 5 个内置词库生成 5 座邻岛（词库学习 ≥40 词解锁），概览页展示群岛链与进度，解锁后可领一次性 100 金币奖励。
  6. **岛屿主题**：阳光海岛（免费）/ 极光雪岛（300 金币）/ 黄昏金岛（500 金币），金币一次性购买，平面渲染整体换色（海面/草地/沙地/天空），本地记住选择。
- **其他页面**：学习、词库导入导出（含重复检测）、词汇花园、统计图表、成就与 NPC 委托任务。

内置 5 个词库、130 个单词，首次访问页面时服务端会自动播种，无需手动导入。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16.2.6（App Router / Turbopack，页面均为动态渲染） |
| UI | React 19.2.6、Tailwind CSS 4、lucide-react、recharts |
| 数据 | PostgreSQL 16、Drizzle ORM 0.45.2、`pg`、16 张表 |
| 测试 | Vitest 5（集成测试连接独立的 `<库名>_test` 测试库） |
| 语言 | TypeScript 5.9 / ESLint 9 |

## 快速开始

> 想把它跑在树莓派上、在外面用手机背单词？见 [docs/deploy-raspberry-pi.md](docs/deploy-raspberry-pi.md)（含 Docker Compose 一键部署与 Tailscale 外网访问方案）。

### 前置条件

- Node.js 22+ 与 npm
- Docker（本机没有 PostgreSQL 时用它起容器）

### 1. 启动数据库

```bash
docker run -d \
  --name word-island-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_db \
  -p 5432:5432 \
  postgres:16
```

已有容器但停掉了：`docker start word-island-pg`。

### 2. 配置环境变量

```bash
cp .env.example .env
```

`.env` 内容（本地默认凭据）：

```text
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

> `drizzle.config.json` 里也带有一份同地址的连接串，供 `drizzle-kit push` 使用；生产环境请改为环境变量注入，不要把真实凭据写进仓库。`.env` 已被 `.gitignore` 排除。

### 3. 安装依赖并建表

```bash
npm install
npx drizzle-kit push --force
```

### 4. 启动

```bash
npm run dev
```

打开 **http://localhost:3000** ，会先进入登录页。**第一个注册的账号自动成为管理员**，并接管数据库里可能存在的升级前遗留数据；之后每个注册账号都会获得独立的内置词库副本（5 库 130 词）与初始玩家档案。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务器（需先 build） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npx vitest run` | 运行全部测试（56 个，含 6 个 Canvas 几何 + 16 个低多边形 3D 单测） |
| `npx drizzle-kit push --force` | 把 `src/db/schema.ts` 同步到数据库 |

## 目录结构

```text
src/
├── app/                  # App Router 页面与 /api/health
│   ├── map/              # 群岛探索（场景战斗入口）
│   ├── study/            # 学习 / 答题
│   ├── island/           # 岛屿建造与商店
│   ├── garden/           # 词汇花园
│   ├── vocab/            # 词库管理
│   └── stats/            # 统计
├── components/
│   ├── map/              # world-map / expedition / battle-scene / scene-canvas / scene-math / monster-art
│   │   └── __tests__/    # Canvas 词贝布局与命中判定的纯函数单测
│   ├── world/            # P2 低多边形 3D 引擎：low-poly / world-canvas / use-scene-mode
│   │   └── __tests__/    # 投影、深度排序、裁剪、着色、网格与场景装配单测
│   ├── island/           # island-world（3D 装配）/ island-3d / 原 SVG 平面视图
│   ├── garden/           # garden-world / garden-3d / plant-positions / 原卡片网格
│   ├── study/  shop/  vocab/
│   └── ui.tsx            # 通用组件、发音、Toast
├── server/               # 服务端领域逻辑与 Server Actions
│   ├── exploration.ts    # 探索、战斗、奖励、防重复发奖
│   ├── player.ts         # 玩家档案与首次播种
│   ├── study.ts  quests.ts  garden.ts  island.ts  vocab.ts
│   └── __tests__/        # 真实数据库集成测试
├── lib/
│   ├── game/             # 题目生成、SRS、经济、类型契约
│   ├── types.ts  utils.ts
│   └── __tests__/
├── data/                 # 内置词库、区域/怪物/NPC 配置
└── db/schema.ts          # Drizzle 表结构（16 张表）
```

## 三种呈现模式

探索页 HUD 右侧的分段按钮切换呈现层，判定与奖励始终走同一套 `resolveEventAction`：

| 模式 | 渲染 | 适用 |
| --- | --- | --- |
| `场景`（默认，P1） | Canvas 2D 词贝 + 粒子 + 拖拽法阵 + 镜头/震动 | 完整体验 |
| `简洁`（P0） | SVG 背景 + DOM 词贝 + 光束/爆点 | 读屏、低性能设备、降级 |
| `极速` | 纯文字卡片 | 快速刷题 |

### P1 Canvas 层怎么做

- `scene-math.ts`：纯几何函数（词贝 2×2 布局、44px 最小点击区、法阵命中判定），可在 Node 里单测，不依赖 DOM。
- `scene-canvas.tsx`：`SceneEngine` 用一个 `requestAnimationFrame` 循环驱动环境浮尘、施法词弹、命中爆点、结算彩带；DPR 自适应 + `ResizeObserver` 重排，页面隐藏时自动暂停。
- `battle-scene.tsx` 把 React 的 `question / feedback / reward` 阶段翻译成 `cast / hit / miss / reward` 特效事件，Canvas 只负责画，答题仍调用上层传入的 `onSubmit`。
- 镜头推进只缩放背景层，词贝坐标不动，因此命中检测不受动画影响；`prefers-reduced-motion` 只关闭动画，交互照常可用。

交互方式：拖动词贝到怪物法阵、直接点击词贝、或按 `1`–`4`；拼写题用「符文输入台」按 Enter 施放；`Enter` 进入下一步。反馈态会保留刚答的那题（多回合首领战服务端会提前返回下一题），并高亮正确 / 错误词贝。

## P2 立体世界（岛屿 / 花园）

设计路线里 P2 是「React Three Fiber 低多边形 3D」或「2.5D 预渲染素材」。这里选了**零依赖的软件 3D 渲染器**：用真实的透视投影 + 深度排序 + 平面着色画低多边形网格，但不需要 WebGL、`three` 或贴图资源，因此 SSR 安全、可单元测试、老设备也能跑。

| 文件 | 职责 |
| --- | --- |
| `components/world/low-poly.ts` | 纯数学：透视投影、相机轨道、Lambert 着色、画家算法、近平面裁剪、屏幕拾取、地面拖拽换算、box / cylinder / cone / sphere / prism 网格生成、昼夜配色 |
| `components/world/world-canvas.tsx` | `WorldEngine`：单 rAF 循环、DPR + ResizeObserver、指针轨道旋转 / 滚轮缩放 / 物体拾取、地平线随俯仰角实时变化、晴雨雪粒子、昼夜、reduced-motion 与页面隐藏暂停 |
| `components/world/use-scene-mode.ts` | `useSyncExternalStore` 实现的 `立体 / 平面` 持久化切换 |
| `island/island-world.ts` | 把 `ISLAND_SLOTS` 映射到 3D 地面坐标，按建筑类型组合低多边形体块，附居民散步与产出光点 |
| `garden/garden-world.ts` | 土台、木框、垄沟；植株按 `GardenPlant.stage / proficiency` 长成种子→开花 |
| `garden/plant-positions.ts` | 拖动后的植株坐标只写 `localStorage`，不动数据库 |

几点取舍：

- **不动表结构、不动 Server Actions**：3D 只是呈现层，建造 / 升级 / 拆除 / 单词详情全部复用原来的 `onSlotClick`、`onBuildingClick` 与详情弹窗。
- **浇水只是场景演示**：真正让植株生长的是答题正确率，所以按钮旁明确写了「去复习，答对才会生长」，避免用假进度误导学习。
- **无障碍**：Canvas `aria-hidden`，每个可交互物体都有一组 `sr-only` 等价按钮；`立体 / 平面` 可一键回到信息更密集 / 更省电的平面视图。
- **性能**：场景约 200–400 个面，`prefers-reduced-motion` 下关闭循环只保留交互重绘；页面隐藏自动暂停。

## 测试与注意事项

- 集成测试**不会碰开发数据库**：Vitest 会把 `DATABASE_URL` 的库名替换为 `<库名>_test`（如 `app_db_test`，也可用 `TEST_DATABASE_URL` 显式指定），并拒绝连接非 `_test` 后缀的库。首次运行测试会自动建表并播种，测试数据只写在测试库里。
- 本地访问请用 `localhost` 而不是 `127.0.0.1`，否则 Next.js dev 会拦截 HMR 的跨域 WebSocket，导致页面交互失效。
- 若本机配了系统代理，`curl` 访问本地服务需要 `curl --noproxy '*' http://localhost:3000/api/health`。
- `npm run typecheck`、`npm run lint`、`npm run build` 与 `npx vitest run` 目前全部通过；历史模板里的 React 19 hook 规则报错已一并修正（含学习页答完一题后未回到答题态导致后续题目无法点击的问题）。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串，缺失时 `src/db/index.ts` 会直接抛错 |
| `TEST_DATABASE_URL` | 否 | 测试专用库连接串；未设置时自动把 `DATABASE_URL` 的库名替换为 `<库名>_test` |
| `GUARDIAN_API_KEY` | 否 | The Guardian Open Platform key（书屿热读槽位抓取今日热点用；未配置时自动回退 BBC News） |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 否 | OpenAI 兼容 AI 接口（书屿长难句解析用；未配置时 AI 入口自动隐藏） |

---

本地开发数据库与演示数据均为示例配置；部署到生产前请替换凭据、配置迁移并限制数据库访问。
