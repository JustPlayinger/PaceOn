# PaceOn · 中长跑训练助手

面向跑步爱好者的训练管理工具，支持 5K / 10K / 半马 / 全马目标。核心功能：

- 通过对话了解个人情况后生成训练课表，逐周安排跑步与力量训练
- 上传跑步 App 截图自动识别训练数据（华为运动健康 / Garmin / Strava / Keep 等）
- 记录每次训练完成情况，生成训练点评并据此调整后续计划
- 提供 Windows 桌面版与 Android 应用

模型能力基于 DeepSeek API。由于 DeepSeek 不支持图片输入，截图识图采用两种方式：优先通过本地 DsBridge 网关（可读取折线图，识别更完整），网关不可用时自动使用内置 tesseract.js OCR。

## ✨ 功能一览

### 🏃 训练管理
- **截图识图（双路径）**：上传跑步 App 长图（华为运动健康/Garmin/Strava/Keep 等），提取距离、时长、配速、心率、步频、步幅、爬升、卡路里、VO2max、心率恢复、触地时间、垂直振幅、左右平衡等 20+ 项数据
  - **路径① DsBridge 网关**：本地网关，图片 → OCR/视觉模型（可读折线图）→ 文本 → DeepSeek
  - **路径② 内置 OCR 兜底**：tesseract.js（中文+英文）识别 + 模板/正则解析，离线可用
- **折线图趋势**：DsBridge 路径下可提取心率/配速/步频/海拔曲线（15-25 个采样点）并生成趋势描述
- **训练点评**：对比计划与实际完成，分析完成度、强度匹配、心率区间、疲劳管理，给出评分与建议
- **课表生成**：基于跑者档案 + 目标赛事 + 上周完成情况 + 上周点评，生成下周训练课表；支持本周微调
- **对话式课表生成**：与教练对话，说明身体状况、停跑恢复、伤病、时间安排等情况后，生成个性化课表

### 📊 17 大功能模块
| 模块 | 功能 |
|------|------|
| 🏠 本周课表 | 今日训练焦点卡片 + 赛事倒计时 + 周概览进度环 + 每日训练卡片（含编辑/热身指导） |
| 📤 上传数据 | 拖拽上传截图 + 自动识别 + 可编辑表单 + 5 类折线图可视化 + 数据校验 + 跑鞋关联 |
| 🧠 训练点评 | 生成本周点评（含折线图趋势分析）+ **🆕 对话式课表生成** + 快速生成 + 本周微调 |
| 📈 趋势分析 | 周跑量/配速/心率/RPE/体感趋势图 + 训练类型分布 + 心率区间分布 + 完成率 |
| 🛡️ 负荷管理 | ACWR 急性/慢性负荷比 + 5 档伤病预警 + 周负荷趋势 + 跑量vs负荷对比 |
| 🔀 训练对比 | 两次训练数据对比 + 心率/配速曲线对比 + 进步总结 |
| 📅 训练日历 | 月度 Heatmap 热力图 + 按训练强度着色 + 日期详情面板 |
| 🎯 目标进度 | Riegel 公式完赛预估 + 达标概率 + 训练阶段建议 + 周跑量趋势 |
| 📚 计划模板 | 5 套预设训练计划（全马/半马/10K，入门到进阶）+ 一键应用 |
| 👟 跑鞋追踪 | 跑鞋 CRUD + 里程自动累计 + 磨损预警 + 与训练完成关联 |
| 💚 恢复追踪 | 每日睡眠/补水/补给/体感记录 + 趋势图表 |
| 🏆 PB 记录 | 6 个标准距离个人最好成绩（1K/3K/5K/10K/半马/全马）|
| 🧮 配速计算器 | 基于目标成绩计算 8 个训练区间配速（恢复/轻松/长跑/马拉松/节奏/阈值/间歇/重复）|
| 🎖️ 成就系统 | 27 个成就徽章（距离/坚持/时长/特殊 4 类）+ 进度追踪 + 激励 |
| 🔍 全局搜索 | ⌘K 快捷键 + 跨训练/跑鞋/PB/恢复记录搜索 + 键盘导航 + Tab 跳转 |
| 📜 历史归档 | 按周列表 + 详情视图（统计/训练点评/每日对比）|
| 👤 跑者档案 | 基本信息/生理指标(含 Karvonen 心率区间)/训练目标/备注 |
| 💾 数据管理 | JSON 导出备份 + 导入恢复 + **🆕 模型配置** + 清空数据 |

### 🎯 训练细节增强
- **今日训练焦点卡片**：渐变 Hero 卡片，三态配色（待完成橙红脉冲/已完成翠绿/休息日深灰）
- **赛事实时倒计时**：每秒更新，5 档紧迫度配色（比赛日/比赛周/冲刺/备战/长期）
- **热身/冷身指导**：根据训练类型动态生成热身步骤、冷身步骤、静态拉伸方案 + 目标心率
- **单次训练深度分析**：结合折线图趋势做配速/心率/跑姿/体感 5 章节分析
- **课表导出**：Markdown 复制 + .md 下载 + 打印 PDF（精美排版）
- **数据校验**：单字段范围校验 + 跨字段一致性校验（心率/配速/距离）

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router) + TypeScript 5 |
| 样式 | Tailwind CSS 4 + shadcn/ui (New York) + Lucide 图标 |
| 数据库 | Prisma ORM + SQLite |
| 模型 | DeepSeek API（deepseek-chat）+ DsBridge 多模态网关 + tesseract.js OCR |
| 桌面端 | Electron（内嵌 Next.js standalone 服务器）|
| 移动端 | Capacitor + Android（GitHub Actions 构建 APK）|
| 图表 | Recharts（折线/面积/柱状/饼图/雷达）|
| Markdown | react-markdown（内容渲染）|

## 📁 项目结构

```
src/
├── app/
│   ├── api/                    # API 路由（28 组）
│   │   ├── runner/             # 跑者档案
│   │   ├── weeks/              # 训练周
│   │   ├── sessions/           # 训练课
│   │   ├── extract/            # 识图
│   │   ├── review/             # 周点评
│   │   ├── plan/               # 快速课表生成
│   │   ├── chat-plan/          # 🆕 对话式课表生成
│   │   ├── adjust/             # 本周微调
│   │   ├── stats/              # 跨周统计
│   │   ├── calendar/           # 月度日历
│   │   ├── goal/               # 目标进度
│   │   ├── templates/          # 训练计划模板
│   │   ├── shoes/              # 跑鞋管理
│   │   ├── recovery/           # 恢复记录
│   │   ├── records/            # PB 记录
│   │   ├── load/               # 负荷管理(ACWR)
│   │   ├── compare/            # 训练对比
│   │   ├── achievements/       # 成就徽章
│   │   ├── search/             # 全局搜索
│   │   ├── config/             # 🆕 模型配置
│   │   ├── seed/               # 种子数据
│   │   └── data/               # 导入导出
│   ├── layout.tsx
│   └── page.tsx                # 主页面（17 Tab）
├── components/
│   ├── ui/                     # shadcn/ui 组件
│   └── views/                  # 25 个视图组件
│       ├── upload-view.tsx     # 上传数据（识图 + 折线图）
│       ├── review-view.tsx     # 训练点评 + 对话式生成入口
│       ├── chat-plan-view.tsx  # 🆕 对话式课表生成
│       ├── trends-view.tsx     # 趋势分析
│       ├── load-view.tsx       # 负荷管理(ACWR)
│       ├── compare-view.tsx    # 训练对比
│       ├── calendar-view.tsx   # 训练日历
│       ├── goal-view.tsx       # 目标进度
│       ├── templates-view.tsx  # 计划模板
│       ├── shoes-view.tsx      # 跑鞋追踪
│       ├── recovery-view.tsx   # 恢复追踪
│       ├── records-view.tsx    # PB 记录
│       ├── pace-calculator-view.tsx  # 配速计算器
│       ├── achievements-view.tsx     # 成就徽章
│       ├── global-search.tsx         # 全局搜索
│       ├── history-view.tsx    # 历史归档
│       ├── profile-view.tsx    # 跑者档案
│       ├── data-view.tsx       # 数据管理 + 模型配置
│       ├── session-edit-dialog.tsx       # 课表编辑
│       ├── session-detail-dialog.tsx     # 单次训练详情 + 分析
│       ├── warmup-cooldown-dialog.tsx    # 热身冷身指导
│       ├── race-countdown.tsx            # 赛事倒计时
│       ├── progress-ring.tsx             # 进度环
│       └── export-utils.ts               # 导出工具
├── lib/
│   ├── ai.ts                   # 模型调用库（对话/点评/课表）
│   ├── ai-config.ts            # 🆕 模型配置加载器（环境变量支持）
│   ├── db.ts                   # Prisma client
│   ├── training.ts             # 训练类型/格式化工具
│   ├── templates.ts            # 训练计划模板数据
│   ├── pace-calculator.ts      # 配速计算（Riegel 公式）
│   └── warmup-cooldown.ts      # 热身冷身方案生成
└── prisma/
    └── schema.prisma           # 10 个数据模型
```

## 🗄 数据模型

| 模型 | 说明 |
|------|------|
| Runner | 跑者档案（姓名/年龄/心率/目标赛事等）|
| TrainingWeek | 训练周（周期/阶段/目标）|
| TrainingSession | 训练课（计划距离/配速/强度/描述）|
| TrainingCompletion | 完成记录（实际数据 + rawExtract 折线图 + shoeId）|
| AIReview | 训练点评/计划/对话记录 |
| Shoe | 跑鞋（品牌/寿命/里程）|
| ShoeUsage | 跑鞋使用记录（关联完成记录）|
| RecoveryLog | 每日恢复记录（睡眠/补水/体感）|
| PersonalRecord | 个人最好成绩（6 个标准距离）|

## 🚀 快速开始

### 环境要求
- Node.js 18+ / Bun
- 已安装依赖（`bun install`）

### 开发运行
```bash
bun run dev          # 启动开发服务器（端口 3000）
bun run lint         # 代码检查
bun run db:push      # 推送 Prisma schema 到数据库
bun run db:generate  # 生成 Prisma Client
```

### 首次使用
1. 访问 `http://localhost:3000`，系统自动初始化示例跑者与本周课表
2. 前往「跑者档案」填写你的真实信息（姓名/心率/目标赛事等）
3. 在「上传数据」上传训练 App 截图，点击「自动识别数据」
4. 核对识别结果（可手动修正），保存完成记录
5. 在「训练点评」生成本周点评，或点击「对话式生成」与教练对话制定个性化课表

## 🔧 本地运行与 API 配置

模型能力使用 DeepSeek API。通过以下方式配置：

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```bash
# 数据库
DATABASE_URL=file:./db/custom.db

# DeepSeek API Key（在 https://platform.deepseek.com 申请）
DEEPSEEK_API_KEY=sk-xxx

# 可选：识图网关地址（本地 DsBridge，图片→OCR/视觉→文本→DeepSeek）
DEEPSEEK_VISION_API_URL=http://127.0.0.1:8901/v1/chat/completions
```

- 识图优先走本地 DsBridge 网关；网关不可达时自动使用内置 tesseract.js OCR
- 移动端「离线模式」下，DeepSeek key 保存在手机本地（localStorage），数据存手机 SQLite，无需服务器

### 配置优先级（从高到低）
1. **环境变量** `DEEPSEEK_API_KEY` / `DEEPSEEK_API_URL` / `DEEPSEEK_VISION_API_URL`
2. **项目根目录** `.env` 文件

### 查看当前配置

在「数据管理」Tab 可查看当前模型配置（配置来源、API 端点，apiKey 脱敏），或访问 `GET /api/config`。

### 本地部署步骤

```bash
# 1. 克隆项目
git clone https://github.com/JustPlayinger/PaceOn.git
cd PaceOn

# 2. 安装依赖
bun install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 DEEPSEEK_API_KEY（https://platform.deepseek.com 申请）
# 可选：DEEPSEEK_VISION_API_URL 指向本地 DsBridge 网关（见下方「截图识图」）

# 4. 初始化数据库
bun run db:push

# 5. 启动开发服务器
bun run dev
```

## 🖥️ 桌面版（Electron）

桌面版内嵌 Next.js standalone 服务器 + SQLite 数据库，离线可用（仅 DeepSeek 调用需联网）。

```powershell
# 打包桌面版（Windows）
powershell -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
# 产物：desktop/release/PaceOn Setup 1.0.0.exe（安装包） + PaceOn 1.0.0.exe（便携版）
```

- 首次启动会弹出设置窗口，填写 DeepSeek API Key（本地保存）
- 数据库与配置存放在 `%APPDATA%\PaceOn`（可写目录，升级不丢数据）
- 截图识图：设置里勾选「随 PaceOn 自动启动」后，应用会自动拉起内置 DsBridge 网关

### 发布桌面版到 GitHub Release

桌面版安装包约 306MB（内含 DsBridge 识图网关）。本地网络对超大文件上传可能受限，换网络后可一键上传：

```powershell
set GITHUB_TOKEN=你的token
python scripts/upload-release-asset.py
```

## 📱 Android APK

APK 支持**两种运行模式**（首次使用在「数据管理」Tab 选择）：

| 模式 | 数据 | AI/识图 | 网络要求 |
|------|------|---------|----------|
| **离线模式**（默认，推荐） | 手机本地 SQLite（sql.js + IndexedDB） | DeepSeek 直连 + 手机本地 OCR（tesseract.js） | 仅调用 DeepSeek 时需联网 |
| 远程服务器模式 | 服务器 SQLite | 服务器端处理 | 需部署 PaceOn 后端 |

- **离线模式**：装 APK → 首次填 DeepSeek API Key（存本地）→ 之后完全本地运行，无需服务器。课表/点评/对话/识图全部可用（识图用手机本地 OCR + DeepSeek 文本解析）。
- 数据可通过「数据管理」导出 JSON 备份/导入。

```bash
# 方式一：GitHub Actions 自动构建（推荐，无需本地 Android SDK）
# 推送到 main 分支后，Actions → Build Android APK → 下载产物

# 方式二：本机构建（需 Android Studio + JDK 21）
bash scripts/build-android.sh
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

> 离线模式为纯前端实现：数据用 sql.js（SQLite WASM）存手机本地，AI 用 DeepSeek 浏览器直连（CORS 已验证），OCR 用 tesseract.js（chi_sim+eng 语言包已打包进 APK）。

## 🖼️ 截图识图（DeepSeek 无多模态的解决方案）

DeepSeek API 官方不支持图片输入。PaceOn 采用双路径：

| 路径 | 原理 | 优点 | 依赖 |
|------|------|------|------|
| ① DsBridge 网关 | 本地 OpenAI 兼容网关拦截 `image_url` → OCR/视觉模型 → 文本 → DeepSeek | 识别最完整（可读折线图）；方案 A 免费本地 OCR | 需安装并启动 [ds-multimodal-bridge](https://github.com/JustPlayinger/ds-multimodal-bridge) |
| ② 内置 OCR | tesseract.js（chi_sim+eng）服务端识别 → 模板/正则解析 → DeepSeek 文本解析补全 | 零依赖、离线可用 | 无（语言包已随仓库提供） |

应用启动时自动探测路径①（`http://127.0.0.1:8901/health`），不可达则走路径②，无需任何手动切换。

## 📖 使用指南

### 对话式课表生成（新）

1. 进入「训练点评」Tab，点击「对话式生成」按钮
2. 像和真人教练聊天一样，描述你的情况：
   - 身体状况：伤病、疲劳、不适
   - 停跑恢复：停跑多久、恢复情况
   - 训练目标：目标赛事、日期、成绩
   - 时间安排：每周能训练几天
   - 特殊环境：高原、高温、工作压力
3. AI 教练会主动询问必要信息（每次 1-2 个问题）
4. 信息收集完整后，点击「生成个性化课表」
5. AI 基于对话内容生成量身定制的训练计划

### 上传训练数据
1. 在跑步 App（华为运动健康/Garmin/Strava/Keep 等）完成训练后，截图保存训练详情长图
2. 进入「上传数据」Tab，选择对应训练课
3. 拖拽或点击上传截图
4. 点击「自动识别数据」，VLM 将自动提取：
   - 基础数据：距离/时长/配速/心率/步频/步幅/爬升/卡路里
   - 跑姿数据：VO2max/心率恢复/触地时间/垂直振幅/左右平衡
   - 折线图：心率曲线/配速曲线/步频曲线/海拔曲线/分段配速（各 15-25 点）
   - 趋势分析：curveAnalysis 文字描述
5. 识别结果自动填入表单，可手动修正
6. 选择使用的跑鞋（自动累计里程），填写 RPE/体感
7. 保存完成记录

### AI 训练点评
- 完成至少一次训练后，在「训练点评」点击「生成本周点评」
- AI 将分析：完成度、强度匹配、**折线图趋势**（心率漂移/配速稳定性/步频变化）、心率区间、疲劳管理
- 点评含 0-100 评分 + markdown 详细分析 + 可执行建议
- 可继续点击「快速生成课表」或「对话式生成」制定下周计划

### 配速计算器
- 在「配速计算器」输入目标赛事与目标成绩
- 系统基于 Riegel 公式反推阈值配速，计算 8 个训练区间配速
- 支持快捷预设（全马 330/400、半马 145、10K 50、5K 25）

### 数据备份
- 在「数据管理」点击「导出 JSON」下载完整备份
- 可在新环境通过「导入数据」恢复（支持合并/替换模式）
- 同页可查看 模型配置

## 🔬 折线图趋势分析（核心能力）

PaceOn 特别重视训练折线图的时间序列数据，认为这些比单一平均值更能反映训练真实状态：

| 曲线 | 分析维度 |
|------|---------|
| 心率曲线 | 起步心率、稳态心率、心率漂移（每公里上升 bpm）、最大心率时机、异常飙升 |
| 配速曲线 | 配速稳定性、前后半程配速差（正/负分割）、掉速段、最快/最慢公里 |
| 步频曲线 | 步频稳定性、疲劳下降趋势、步频与配速关联 |
| 海拔曲线 | 上下坡对配速/心率的影响、爬升段表现 |
| 分段配速 | 每公里配速变化趋势、配速分布 |

VLM 识别的折线图数据会：
1. 在「上传数据」可视化展示（5 条曲线图）
2. 存入 `rawExtract` 字段持久化
3. 在「训练点评」解析后传给 LLM，生成专门的「折线图趋势分析」章节
4. 在「单次训练详情」的 AI 深度分析中作为核心参考
5. 在「训练对比」中对比两次训练的曲线变化

## 📱 移动端打包（Android APK）

PaceOn 支持 PWA 和 Capacitor 两种移动端方案。

> 📖 **完整打包指南**：请阅读 [MOBILE_BUILD_GUIDE.md](./MOBILE_BUILD_GUIDE.md) —— 含环境准备、代码拉取、构建、安装到手机的全流程详细步骤。

### 方案一：PWA（渐进式 Web 应用）

PWA 让用户可以直接从浏览器"添加到主屏幕"安装应用，无需应用商店。

**已配置**：
- `public/manifest.json`：应用清单（名称/图标/主题色/快捷方式）
- `public/sw.js`：Service Worker（离线缓存 + 快速加载）
- PWA 图标：192/256/384/512px + maskable 自适应图标 + apple-touch-icon
- layout.tsx：meta 标签（apple-web-app-capable / theme-color / viewport）

**使用**：
1. 在手机浏览器（Chrome/Safari）打开应用
2. 浏览器菜单 → "添加到主屏幕" / "安装应用"
3. 从主屏幕启动，全屏沉浸式体验

### 方案二：Capacitor 打包 Android APK

将 Web 应用打包成真正的 Android 原生应用，可发布到应用商店。

**前置条件**：
- Android Studio + Android SDK
- Java JDK 17+
- 环境变量 `ANDROID_HOME` 指向 SDK 目录

**一键打包**：
```bash
bash scripts/build-android.sh
```

脚本会自动：
1. 临时切换 Next.js 为静态导出模式（`output: export`）
2. 构建静态文件到 `out/` 目录
3. 同步到 Capacitor Android 项目
4. 构建 debug APK

**产物**：`android/app/build/outputs/apk/debug/app-debug.apk`

**安装到设备**：
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**构建 Release 版本**（需要签名密钥）：
```bash
cd android
./gradlew assembleRelease
```

**Capacitor 配置**（`capacitor.config.ts`）：
- appId: `com.paceon.app`
- 应用名：PaceOn
- 启动画面：emerald 绿色背景
- 状态栏：深色主题 + emerald 背景
- 键盘：自动调整布局

### 移动端优化

- **底部导航栏**：手机端显示 5 个快捷 Tab（课表/上传/AI/负荷/更多）
- **安全区域**：适配 iPhone 刘海屏和 Android 手势导航（env(safe-area-inset)）
- **禁止缩放**：viewport 设置 maximum-scale=1，防止误触缩放
- **触摸优化**：最小 44px 触摸目标
- **响应式布局**：所有页面 mobile-first 设计

## 📝 许可证

本项目为演示项目，仅供学习参考。

---

**PaceOn** · 由 Z.ai VLM + LLM 驱动 · 科学周期化训练
