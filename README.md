# Word Island · 单词岛屿

一个把「背单词」做成冒险游戏的 Web 应用：答题即战斗、答对即奖励，用金币和经验建设自己的岛屿，把掌握的单词种进词汇花园。

项目基于 Next.js 16 App Router + React 19 + PostgreSQL（Drizzle ORM）+ Tailwind 4，全部数据落在真实数据库里，附带 34 个单元/集成测试。

---

## 功能亮点

- **8 种题型**：英译中、中译英、拼写挑战、语境选择、听音辨词、同义辨析、反义匹配、句子构建。
- **间隔复习（SRS）**：每次答题都会更新熟练度与下次复习时间，状态分为「未学习 → 学习中 → 复习中 → 已掌握」。
- **群岛探索**：6 个区域（沙滩 / 森林 / 神秘遗迹 / 港口 / 山脉 / 远洋群岛），按等级、已学词数或道具解锁；每次探索 6–8 个事件，包含怪物、首领、NPC、宝箱、营地、漂流瓶与石碑。
- **场景化战斗（P0）**：`/map` 的探索默认进入 SVG + CSS 绘制的战斗场景——题干挂在木牌上，答案变成场景里可点击的「词贝」，答对会有施法光束、命中爆点与伤害飘字，战后用石碑展示单词释义、例句与奖励。右上角 `极速` 按钮可随时切回传统卡片答题，选择会记在 `localStorage`。
- **成长闭环**：金币 / 经验 / 连击奖励 → 岛屿建造与商店道具 → 解锁新区域；答错的单词自动排入复习队列。
- **其他页面**：学习、词库导入导出（含重复检测）、词汇花园、统计图表、成就与 NPC 委托任务。

内置 5 个词库、130 个单词，首次访问页面时服务端会自动播种，无需手动导入。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16.2.6（App Router / Turbopack，页面均为动态渲染） |
| UI | React 19.2.6、Tailwind CSS 4、lucide-react、recharts |
| 数据 | PostgreSQL 16、Drizzle ORM 0.45.2、`pg`、16 张表 |
| 测试 | Vitest 5（集成测试直接连真实数据库） |
| 语言 | TypeScript 5.9 / ESLint 9 |

## 快速开始

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

打开 **http://localhost:3000** 。首次请求 `/map` 会自动创建玩家档案并播种内置词库。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务器（需先 build） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npx vitest run` | 运行全部测试（34 个） |
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
│   ├── map/              # world-map / expedition / battle-scene / monster-art
│   ├── study/  garden/  island/  shop/  vocab/
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

## 场景模式 vs 极速模式

探索页 HUD 右侧的模式按钮在两种呈现间切换，二者共用同一套 `resolveEventAction` 服务端逻辑，答题、奖励与 SRS 结果完全一致：

- **场景模式（默认）**：SVG 背景随区域变化；答案是场景中的词贝；拼写题用「符文输入台」，按 Enter 施放；反馈态保留题干与选项高亮，底部浮出词碑。
- **极速模式**：原生的卡片式题干与选项按钮，适合想快速刷题的场景。

两种模式都保留键盘操作：`1`–`4` 选择选项、`Enter` 提交拼写 / 进入下一步；场景动画支持 `prefers-reduced-motion`。

## 测试与注意事项

- `npx vitest run` 的集成测试会 `truncate` 所有表。**跑完测试后请重启开发服务器**：服务端用进程内标记跳过重复播种，否则再次访问 `/map` 会报「玩家档案初始化失败」。重启后首次访问会自动补回玩家与 130 个单词。
- 本地访问请用 `localhost` 而不是 `127.0.0.1`，否则 Next.js dev 会拦截 HMR 的跨域 WebSocket，导致页面交互失效。
- 若本机配了系统代理，`curl` 访问本地服务需要 `curl --noproxy '*' http://localhost:3000/api/health`。
- 全量 `npm run lint` 目前仍有几处与本次改动无关的 React 19 hook 规则报错（`island-view.tsx`、`quiz-session.tsx`、`vocab-manager.tsx`）；`npm run typecheck`、`npm run build` 与测试均通过。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串，缺失时 `src/db/index.ts` 会直接抛错 |

---

本地开发数据库与演示数据均为示例配置；部署到生产前请替换凭据、配置迁移并限制数据库访问。
