# PaceOn · 智能长跑训练指导 - 工作日志

## 项目概述
AI 驱动的长跑训练指导系统，集成 OCR/视觉识别（训练 App 长图数据提取）+ DeepSeek LLM 训练点评与课表生成。

## 技术栈
- Next.js 16 (App Router) + TypeScript 5
- Prisma ORM + SQLite
- Tailwind CSS 4 + shadcn/ui
- DeepSeek API（deepseek-chat）+ DsBridge 多模态网关 + tesseract.js OCR
- Electron（桌面版）/ Capacitor + GitHub Actions（Android APK）
- Recharts (折线图可视化) / react-markdown (AI 输出渲染)

---

## 2026-08-14 · DeepSeek 迁移 + 识图双路径 + 桌面版 + APK + GitHub 发布

### 背景
- DeepSeek API 官方**无多模态**能力，原代码调用不存在的 `deepseek-multi-modal` 模型（识图实际不可用）
- 本机已安装 DsBridge（本地 OpenAI 兼容网关，图片→OCR/视觉→文本→DeepSeek）但未配置/运行

### 完成内容

**1. AI 层修正（src/lib/ai.ts）**
- `callDeepseekApi` 统一模型 `deepseek-chat`，文本请求走官方 API，视觉请求走 `DEEPSEEK_VISION_API_URL`（默认 DsBridge 网关），增加超时（AbortController）
- `extractTrainingDataFromImage` 双路径：① DsBridge 网关优先；② 内置 OCR 兜底（tesseract.js + 模板解析 + DeepSeek 文本解析）
- 新增 `EXTRACT_PROMPT` / `OCR_PARSE_PROMPT`（模块级），配速格式归一化 `5'40"/km → 5:40/km`

**2. 内置 OCR 模块（src/lib/ocr/）**
- `ocr.ts`：tesseract.js v7 服务端封装，chi_sim+eng，本地语言包（public/ocr-lang，离线可用）
- `parse.ts`：中英文标签锚点 + 正则解析（距离取分段最大值、时长、配速、心率、步频、卡路里、步数、速度、温度、天气等），数字空格归一化
- `templates.ts`：来源 App 检测（Keep/Garmin/Strava/华为/咕咚/悦跑圈/高驰/颂拓等）
- `next.config.ts` 增加 `serverExternalPackages: ['tesseract.js']`

**3. 环境与基础设施**
- `.env` 更新新 DeepSeek key + `DEEPSEEK_VISION_API_URL`；`.env.example` 创建；`.env` 从 git 跟踪移除
- 修复 `DATABASE_URL`（原指向 `F:/PaceOn`（旧位置 0 字节空库），修正为 `F:/project/PaceOn`）
- 安装 rapidocr_onnxruntime + onnxruntime 1.20.1（修复 NumPy 2.x 兼容）
- DsBridge 配置写入 key 并启动（端口 8901）
- `bun run build` 的 `cp -r` 替换为跨平台 `scripts/after-build.mjs`

**4. 桌面版（Electron，desktop/）**
- `main.js`：内嵌 Next.js standalone 服务器（ELECTRON_RUN_AS_NODE 子进程），自动选空闲端口，首启设置向导（DeepSeek Key / DsBridge 网关），配置与数据库放 `%APPDATA%\PaceOn`
- `scripts/build-desktop.ps1`：一键打包（含 electron-builder Defender 补丁）
- 产物：`desktop/release/PaceOn Setup 1.0.0.exe` + `PaceOn 1.0.0.exe`（已验证运行）

**5. Android APK（Capacitor）**
- `npx cap add android` 生成工程
- 静态导出方案：临时移开 `src/app/api`（export 不支持 route.ts）→ 构建 out/
- 客户端 API 基址补丁 `src/lib/api-client.ts`（window.fetch 拦截 /api/* → 远程服务器），数据管理页新增服务器地址配置
- `.github/workflows/build-apk.yml`：GitHub Actions 自动构建（ubuntu + JDK17 + Android SDK）并上传 APK

**6. GitHub**
- 新建仓库 `JustPlayinger/PaceOn`（public），git 历史重建（避免旧 .env 泄露）
- 4 个提交已推送，敏感文件（.env/db/node_modules/构建产物）已从仓库排除

### 验证结果
- DsBridge 识图端到端：华为运动健康截图 → 10km / 5:40/km / HR167/186 / 步频164 / 781kcal / 折线图21点 ✓
- 内置 OCR 兜底：同图 → 10km / 5:40/km / HR167/196 / 步频164 / 9313步 / 787kcal ✓
- 对话式课表生成（DeepSeek 文本）：AI 主动追问脚踝疼痛/半马目标，回复专业 ✓
- 桌面版（开发 + 打包后）：服务器自启、数据库连接、界面加载 ✓
- 静态导出（CI 流程）：EXIT 0，out/ 完整 ✓
- GitHub CI 构建 APK：已触发运行中

### 遗留 / 说明
- APK 为远程后端模式，需部署 PaceOn 服务器后在「数据管理」配置地址
- 桌面版识图：DsBridge 方案 A（本地 OCR）无折线图曲线；方案 B（Ollama+Qwen2.5-VL）可读图
- DeepSeek API key 已在对话中明文出现，建议在 platform.deepseek.com 重置


---
Task ID: 1-9
Agent: 主 Agent (Z.ai Code)
Task: 构建完整的 PaceOn 智能长跑训练指导系统

Work Log:
- 设计 Prisma 数据模型：Runner / TrainingWeek / TrainingSession / TrainingCompletion / AIReview，已 db:push
- 构建 AI 能力库 src/lib/ai.ts：
  - VLM 提取训练数据（距离/时长/配速/心率/爬升/步频/卡路里/天气 + 配速/心率/海拔折线图）
  - LLM 本周点评（评分 0-100 + markdown 内容 + 可执行建议）
  - LLM 下周课表生成（周期化训练，7 天课表，基于跑者档案+上周完成+上周点评）
  - LLM 本周微调建议（剩余训练调整）
  - LLM 初始课表生成
- 构建 9 组 API 路由：runner / weeks(含 [id], [id]/reviews) / sessions(含 [id], [id]/complete) / extract / review / plan / adjust / seed
- 构建前端单页应用（src/app/page.tsx）含 5 个 Tab：
  - 本周课表：周概览统计 + 每日训练卡片（完成状态/计划/实际数据）
  - 上传数据：训练课选择 + 拖拽上传 + AI 识别 + 可编辑表单 + RPE/体感滑块 + 折线图展示
  - AI 点评：生成本周点评 + 生成下周课表 + 本周微调
  - 历史归档：按周列表 + 详情视图（统计/AI点评/每日详情）
  - 跑者档案：基本信息/生理指标(含心率区间)/训练目标/备注
- 种子数据：示例跑者（全马 sub 3:45 目标）+ 本周基础期课表（7 天，49km）
- 首次访问自动初始化种子数据

Stage Summary:
- 全部核心功能开发完成并通过 Agent Browser 端到端验证
- VLM 识别：POST /api/extract 200 (3.9s)，成功提取数据并自动填表
- LLM 点评：POST /api/review 200，生成 75/100 评分 + markdown 点评 + 建议
- LLM 课表生成：POST /api/plan 200 (15s)，成功生成第 2 周 7 节课表（57km）
- 数据持久化：完成记录保存成功，课表状态自动更新为「已完成」
- 无控制台错误，无横向滚动，页脚布局正确（min-h-screen flex-col + flex-1 + mt-auto）
- ESLint 通过

---
Task ID: 10
Agent: 主 Agent (Z.ai Code)
Task: Agent Browser 端到端验证

Work Log:
- 打开 / 路由，确认页面渲染（标题 PaceOn · 智能长跑训练指导）
- 验证本周课表视图：第 1 周 · 基础期，7/20-7/26，7 节训练课（轻松跑/休息/节奏跑/恢复跑/长跑/恢复跑）
- 验证上传数据：填写表单（8km/50min/5:35/km/152bpm）→ 保存 → 状态变更为「已完成」
- 验证 AI 点评：点击「生成本周点评」→ LLM 生成 75/100 评分 + 详细 markdown 点评 + 可执行建议
- 验证课表生成：点击「生成下周课表」→ LLM 生成第 2 周课表（基础期，57km，7 节训练课）
- 验证 VLM 识别：生成模拟跑步 App 截图 → 上传 → 点击「AI 智能识别」→ POST /api/extract 200 (3.9s) → 提取数据自动填入表单
- 验证历史归档：显示 2 个训练周，含统计（距离/完成率/时长）+ 缩略图
- 验证跑者档案：5 个分区 + 心率区间参考（Karvonen 法）
- 检查控制台：无错误
- 检查响应式：1280px 无横向滚动

Stage Summary:
- 所有核心交互流程验证通过
- 5 个 Tab 全部可用
- 3 大 AI 能力（VLM 识别 + LLM 点评 + LLM 课表生成）端到端验证成功
- 数据持久化与状态同步正常

## 当前项目状态
✅ 稳定可用。完整版 17 Tab + PWA/Capacitor 移动端 + 轻量版（paceon-lite）3 Tab 精简版。

---
Task ID: 24
Agent: 主 Agent (Z.ai Code)
Task: 创建轻量化版本（paceon-lite）

Work Log:
- 需求：创建精简版，只保留课表管理 + 数据上传与 AI 识别 + AI 点评与课表生成
- 创建 paceon-lite/ 独立目录（完整版互不干扰）
- 数据模型精简：5 个模型（Runner/TrainingWeek/TrainingSession/TrainingCompletion/AIReview），去除 Shoe/ShoeUsage/RecoveryLog/PersonalRecord
- API 精简：8 组（runner/weeks/weeks/[id]/reviews/sessions/[id]/complete/extract/review/plan/seed），从 31 组精简到 8 组
- AI 库精简：仅保留 extractTrainingDataFromImage（VLM 提取）+ generateWeeklyReview（LLM 点评）+ generateNextWeekPlan/generateInitialPlan（LLM 课表生成），去除对话式生成/微调/单次分析
- 前端精简：单文件 page.tsx，3 个 Tab（课表/上传数据/AI 建议），移动端底部导航
- VLM 识别保留核心能力：距离/配速/心率/步频/爬升/卡路里 + 心率/配速/海拔折线图 + curveAnalysis 趋势分析
- LLM 点评保留折线图趋势分析章节
- 配置文件：package.json（端口 3001）/ .env.example / README.md（含完整版对比表）
- 复用主项目的 shadcn/ui 组件、hooks、globals.css、tsconfig、next.config 等

Stage Summary:
- 轻量版文件结构：8 组 API + 4 个 lib + 1 个 page + 1 个 layout + 53 个 UI 组件（复用）
- 对比完整版：Tab 3 vs 17，API 8 vs 31，数据模型 5 vs 9，视图组件 1 vs 25
- 核心功能完整保留：课表管理 + VLM 数据识别 + LLM 点评 + LLM 课表生成
- 去除的高级功能：跑鞋/恢复/PB/负荷/对比/成就/搜索/配速计算器/对话式生成/热身冷身/数据导入导出
- 需本地 bun install + db:push + 配置 .env 后可独立运行（端口 3001）

## 未解决问题 / 风险
- 轻量版未独立 lint 验证（需本地 bun install 后验证）
- Termux 方案需要一定技术能力

## 下一阶段建议
1. 本地验证轻量版可独立运行
2. 多用户支持（NextAuth + 数据隔离）
3. 移动端 PWA 离线模式完善

---
Task ID: 25
Agent: 主 Agent (Z.ai Code)
Task: 轻量版移动端本地运行完整指南

Work Log:
- 修复 UI 组件路径（从 src/components/ 移到 src/components/ui/）
- 为轻量版添加 PWA 配置：
  - 复制 manifest.json / sw.js / 8 个图标到 public/
  - 更新 layout.tsx：PWA meta 标签 + viewport + Service Worker 注册
- 创建 MOBILE_GUIDE.md：3 种方案完整指南
  - 方案 A：PWA 安装（电脑跑服务器 + 手机浏览器安装到主屏幕）
  - 方案 B：局域网持续访问（pm2 守护 + 固定 IP）
  - 方案 C：Termux 手机直跑（纯手机方案，无需电脑）
- 每种方案含详细步骤：环境准备→代码获取→依赖安装→配置→数据库→启动→手机连接→PWA 安装
- 含常见问题排查（防火墙/连接拒绝/图标不显示/AI不可用/数据库失败/ngrok 外网穿透）

Stage Summary:
- 轻量版完整文件：65 TS/TSX + 7 配置 + 8 PWA 资源 + 2 文档
- PWA 功能完整：manifest + sw.js + 图标 + meta 标签 + SW 注册
- 3 种移动端运行方案覆盖所有场景

Work Log:
- 需求：将 PaceOn 打包到 Android 移动端
- 方案：PWA（渐进式 Web 应用）+ Capacitor（原生 APK 打包）双方案
- PWA 配置：
  - 生成应用图标（192/256/384/512px + maskable 192/512 + apple-touch-icon 180 + favicon 32）
  - 创建 public/manifest.json：应用清单（名称/图标/主题色#10b981/快捷方式 3 个）
  - 创建 public/sw.js：Service Worker（静态资源缓存优先 + API 网络优先 + 离线回退）
  - 创建 src/components/service-worker-register.tsx：客户端 SW 注册（仅 production）
  - 更新 layout.tsx：PWA meta 标签（manifest/theme-color/apple-web-app-capable/viewport）
  - viewport 配置：device-width + maximum-scale=1（禁止缩放）+ viewportFit=cover（安全区域）
  - 验证：manifest.json 200 + sw.js 200 + 所有图标 200 + meta 标签正确
- Capacitor Android 打包：
  - 安装 @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/haptics @capacitor/keyboard @capacitor/status-bar
  - 创建 capacitor.config.ts：appId=com.paceon.app, webDir=out, 启动画面/状态栏/键盘配置
  - 创建 scripts/build-android.sh：一键打包脚本
    - 临时切换 next.config 为 output:export 静态导出
    - 构建静态文件到 out/
    - 同步到 Capacitor Android
    - 构建 debug APK
  - 使用方法：bash scripts/build-android.sh
- 移动端响应式优化：
  - 新增移动端底部导航栏（md:hidden，仅手机显示）
  - 5 个快捷 Tab：课表/上传/AI/负荷/更多
  - 安全区域适配（env(safe-area-inset-bottom)）
  - main 内容区增加 pb-24 md:pb-8（避免被底部导航遮挡）
  - 新增 MobileTabButton 组件（图标+文字，纵向布局）
- 更新 README：
  - 新增「移动端打包（Android APK）」专章
  - PWA 方案说明（manifest/sw.js/图标/使用方法）
  - Capacitor 方案说明（前置条件/一键打包/产物/安装/Release）
  - 移动端优化说明（底部导航/安全区域/禁止缩放/触摸优化/响应式）

Stage Summary:
- 验证通过：
  - manifest.json 200：应用清单正确
  - sw.js 200：Service Worker 正确
  - 图标全部 200：icon-192(23KB)/icon-512(100KB)/apple-touch-icon/maskable-512
  - PWA meta 标签：manifest/themeColor#10b981/appleCapable=yes/appleTitle=PaceOn 全部正确
  - 移动端底部导航栏：5 个按钮，桌面 display:none，手机可见
  - 无控制台错误
- ESLint 通过（0 error 0 warning）
- 注意：Capacitor Android APK 打包需要本地 Android Studio + SDK 环境，云端沙箱无法执行，但脚本和配置已就绪

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- Capacitor APK 打包需本地 Android 开发环境（Android Studio + SDK + JDK 17+）
- 静态导出模式（output:export）不支持 API 路由，APK 版需配合远程 API 或嵌入式服务

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 离线模式完善（缓存策略优化）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 需求1：对话式课表生成（自由输入个人情况与诉求）
  - 新增 lib/ai.ts 中 chatWithCoach 函数：AI 教练多轮对话收集信息
    - system prompt 定义 7 大需了解维度：身体状况/近期训练/训练目标/当前水平/时间安排/特殊情况/跑者偏好
    - 对话原则：每次只问 1-2 个问题、深入追问、亲切专业、信息完整时返回 ready=true
    - 返回 JSON：reply/ready/questions
  - 新增 lib/ai.ts 中 generatePlanFromChat 函数：基于对话上下文生成个性化课表
    - system prompt 强调课表必须体现对话中的特殊情况（伤病恢复/停跑/时间受限/高原高温等）
    - 结合跑者档案 + 对话记录 + 上周训练数据 + 上周点评
  - 新增 API /api/chat-plan：支持 action=chat（对话）和 action=generate（生成课表）
    - 生成课表时保存对话记录到 AIReview（type=chat_plan）
  - 新增组件 chat-plan-view.tsx：
    - 对话界面（消息气泡 + AI 教练头像 + 用户头像）
    - 输入框（Enter 发送，Shift+Enter 换行）
    - 信息收集完整提示（ready 状态）
    - 生成课表按钮
    - 重新开始对话
    - 5 个快捷话题建议（膝伤恢复/备战全马/时间受限/高原训练/新手10K）
  - 集成到 AI 点评视图：新增「对话式生成」按钮，与「快速生成课表」并列
  - 验证：AI 正确追问"膝盖位置？跑步时还是跑后？持续多久？"，多轮对话收集信息

- 需求2：本地运行 + API 接口可配置
  - 新增 lib/ai-config.ts：AI 配置加载器
    - ensureAiConfig()：若环境变量 ZAI_BASE_URL/ZAI_API_KEY 存在，自动生成 .z-ai-config
    - getAiConfigStatus()：返回当前配置状态（脱敏，不返回 apiKey 明文）
    - 配置优先级：环境变量 > 项目 .z-ai-config > ~/.z-ai-config > /etc/.z-ai-config
  - 更新 lib/ai.ts getZai()：调用 ensureAiConfig() 确保配置可用
  - 新增 API /api/config：GET 返回当前 AI 配置状态
  - 新增 .env.example：环境变量配置模板（DATABASE_URL + ZAI_BASE_URL + ZAI_API_KEY）
  - 新增 .z-ai-config.example：配置文件模板
  - 更新 data-view.tsx：新增 AI 配置状态卡片
    - 显示配置来源、API 端点、配置状态徽章
    - 如何自定义 API 端点说明（环境变量 + .z-ai-config 两种方式）
  - 验证：config API 返回 configured=true, source=/etc/.z-ai-config, baseUrl=internal-api.z.ai

- 需求3：更新 README
  - 核心特性：AI 能力从 4 大扩展到 5 大（新增对话式课表生成）
  - 功能模块：从 14 大更新为 17 大（新增负荷管理/训练对比/成就系统/全局搜索，AI 点评含对话式生成）
  - 项目结构：API 28 组、视图 25 个组件、新增 ai-config.ts/chat-plan API/config API
  - 新增「本地运行与 API 配置」专章：
    - 方式一：环境变量（.env 中设置 ZAI_BASE_URL/ZAI_API_KEY）
    - 方式二：配置文件（.z-ai-config）
    - 配置优先级说明
    - 查看当前配置方法
    - 本地部署步骤
  - 新增「对话式课表生成」使用指南
  - 折线图分析说明更新（新增训练对比维度）

Stage Summary:
- 验证通过（curl API + agent-browser 对话测试）：
  - config API 200：返回配置状态（系统级配置，baseUrl 正确）
  - chat-plan API chat 200：AI 回复"膝盖恢复情况如何？是否已开始恢复训练？"
  - chat-plan API 第二轮：AI 深入追问"受伤前周跑量和训练频率？"
  - 前端对话界面：消息气泡 + 输入框 + 快捷话题 + 生成按钮，全部正常
  - AI 配置状态卡片：显示已配置 + 来源 + 端点 + 自定义说明
  - 无控制台错误
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- dev server 在本环境不稳定（环境问题，非代码问题）
- 对话式生成依赖 LLM 多轮调用，响应时间较长（每次对话 10-30s）

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 20 个 Task 已完成
- QA 测试：server 状态检查，runner/load/compare API 均 200 响应
- 新功能1：训练成就徽章系统（AchievementsView）
  - 新增 API /api/achievements：
    - 27 个成就徽章，4 大类别（距离里程/坚持训练/训练时长/特殊成就）
    - 距离类：初次起跑/十次训练/半百训练/百次训练 + 50/100/500/1000km + 单次5K/10K/半马/全马达成
    - 坚持类：三日/七日/月度连跑 + 4/12/26 周训练
    - 时长类：10/50/100 小时训练
    - 特殊类：跑鞋管理/收藏家 + 首个PB/PB大满贯 + VO2max 50+/60+
    - 计算最长连续训练天数、累计跑量、训练次数、周数
  - 新增组件 src/components/views/achievements-view.tsx：
    - Hero 卡片（橙红渐变 + SVG 进度环 + 4 项统计）
    - 类别筛选按钮（全部/距离/坚持/时长/特殊）
    - 成就卡片网格（已解锁：金色渐变+星标；未解锁：灰色+锁图标+进度条）
    - 每个徽章含图标/名称/描述/进度
  - 主页面新增「成就」Tab（第 15 个 Tab）
  - 验证：已解锁 6/27（22%），含初次起跑/5K达成/10K达成/跑鞋管理/首个PB/VO2max 50+
- 新功能2：全局搜索（GlobalSearch）
  - 新增 API /api/search：跨训练周/训练课/跑鞋/恢复记录/PB 记录搜索
    - 按训练周 goal/phase/summary 搜索
    - 按训练课 type/description/intensity 搜索
    - 按跑鞋 name/brand/model 搜索
    - 按恢复记录 notes/fuel 搜索
    - 按 PB raceName/location/distance 搜索
  - 新增组件 src/components/views/global-search.tsx：
    - 顶部导航栏搜索框（支持 ⌘K 快捷键聚焦）
    - 防抖 300ms 搜索
    - 搜索结果下拉（含类型图标/标签/标题/副标题/元信息）
    - 键盘导航（↑↓ 选择，Enter 跳转，Esc 关闭）
    - 点击外部自动关闭
    - 点击结果自动跳转对应 Tab
  - 主页面顶部导航栏集成搜索框
  - 主组件监听 paceon-navigate 事件切换 Tab
  - 验证：搜索 "easy" 返回 8 个轻松跑训练课，搜索 "Nike" 返回跑鞋结果

Stage Summary:
- 验证通过（curl API + agent-browser 视觉测试 + VLM 评估）：
  - achievements API 200：27 个成就，已解锁 6 个（22%）
  - search API 200："easy" → 8 结果，"Nike" → 跑鞋结果
  - 成就 Tab：进度环+类别筛选+徽章卡片渲染正确，VLM 评价"有效激发用户的收集欲和持续训练动力"
  - 全局搜索：⌘K 快捷键+防抖搜索+键盘导航+Tab 跳转，全部正常
  - 无控制台错误
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- dev server 在本环境不稳定（环境问题，非代码问题）
- 成就徽章固定 27 个，后续可动态扩展

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 19 个 Task 已完成
- QA 测试：server 状态检查，runner/stats/records API 均 200 响应
- 新功能1：训练负荷管理（LoadView）—— ACWR 急性/慢性负荷比 + 伤病预警
  - 新增 API /api/load：
    - 计算每周训练负荷（距离 × 强度系数：轻松1.0/长跑1.2/节奏1.5/间歇2.0）
    - 计算 ACWR = 急性负荷(1周) / 慢性负荷(4周均值)
    - 5 档风险等级：训练不足(<0.8)/最佳(0.8-1.3)/偏高(1.3-1.5)/过度训练(>1.5)
    - 7天滚动 ACWR（按天精确计算）
    - RPE 内部负荷计算
    - 个性化建议文案
  - 新增组件 src/components/views/load-view.tsx：
    - ACWR 核心 Hero 卡片（渐变背景 + 3 数据卡 + 量表指针 + 建议框）
    - ACWR 量表（0.5-2.0，4 色区间：天蓝/翠绿/琥珀/玫红 + 白色指针）
    - 汇总统计 4 指标（总周数/平均负荷/最高负荷/7天ACWR）
    - 周训练负荷趋势柱状图（当前周高亮 + 慢性负荷参考线）
    - 跑量 vs 负荷对比双轴折线图
    - 周负荷明细表（负荷/RPE负荷/跑量/时长/次数）
    - ACWR 科学说明
  - 主页面新增「负荷管理」Tab（第 5 个 Tab）
- 新功能2：训练对比（CompareView）—— 对比两次训练看进步
  - 新增 API /api/compare：GET 接收 id1/id2，返回两次训练完整数据 + 差值计算
    - 解析 rawExtract 折线图数据
    - 计算距离/时长/配速/心率/步频/爬升/卡路里差值
  - 新增组件 src/components/views/compare-view.tsx：
    - 双选择器（训练A较早 → 训练B较近）
    - 训练信息对比卡（图标/日期/周次/阶段）
    - 数据对比表（8 项指标，含进步/退步图标 + 差值着色）
    - 心率曲线对比折线图（A 虚线灰 vs B 实线红）
    - 配速曲线对比折线图（A 虚线灰 vs B 实线橙）
    - 进步总结（自动生成文字描述：配速提升X秒/心率变化/距离变化/步频变化）
  - 主页面新增「训练对比」Tab（第 6 个 Tab）

Stage Summary:
- 验证通过（curl API + agent-browser 视觉测试 + VLM 评估）：
  - load API 200：ACWR=0（最近一周无完成），慢性负荷3.3，状态"训练不足"，建议正确
  - compare API 200：训练A(10km@6:00) vs 训练B(10km@5:30)，配速差-30s（进步）
  - 负荷管理 Tab：ACWR 量表+指针渲染正确，VLM 评价"专业度极高，严谨的数据驱动训练理念"
  - 训练对比 Tab：数据对比表+进步总结正确，VLM 评价"结构清晰易读，实用性强"
  - 无控制台错误
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- dev server 在本环境不稳定（环境问题，非代码问题）
- ACWR 基于通用强度系数，个体差异需结合实际调整

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 分析用户上传的真实训练截图（华为运动健康，含 9 类图表、高密度采样）
- VLM 评估确认：截图含心率/配速/步频/海拔/触地时间/垂直振幅/平衡等曲线，X 轴为时间
- 增强 VLM 提取能力（src/lib/ai.ts）：
  - ExtractedTrainingData 接口扩展：新增 descent/strideLength/steps/avgSpeed/vo2max/hrRecovery/groundContactTime/verticalOscillation/leftRightBalance/cadenceCurve/splitPaces/hrZones/curveAnalysis/appSource 共 14 个字段
  - EXTRACT_PROMPT 重写：明确说明长图通常包含的图表类型，要求采样 15-25 个点，curveAnalysis 字段详细描述各曲线趋势
  - parseExtractedData 增强：先尝试 JSON.parse，失败则用 extractFieldsByRegex 正则逐字段提取（解决 rawText 含未转义引号导致解析失败的问题）
- 增强 LLM 分析能力：
  - generateWeeklyReview（周点评）：prompt 新增「折线图趋势分析」章节要求，分析心率漂移/配速分割/步频稳定性/海拔影响
  - analyzeSingleSession（单次分析）：prompt 重写，新增「折线图趋势分析（核心！）」和「跑姿与效率」章节，system prompt 强调折线图比平均值更能反映训练状态
  - SessionForReview 接口扩展：completion 新增 paceCurve/hrCurve/elevationCurve/cadenceCurve/splitPaces/curveAnalysis/vo2max/hrRecovery/groundContactTime/verticalOscillation/leftRightBalance/strideLength
  - review API 更新：解析 rawExtract 中的折线图数据传入 LLM
  - sessions/[id]/detail API 更新：解析 rawExtract 传入 analyzeSingleSession
- 增强 upload-view.tsx：
  - ExtractedData 接口同步扩展
  - 识别结果展示区：从 8 项扩展到 14 项数据芯片 + appSource 来源标签 + curveAnalysis 趋势描述框
  - 折线图展示区：从 3 条曲线扩展到 5 条（新增步频曲线、分段配速），含说明"AI 分析时将作为重要参考"
  - countExtractedFields 更新统计新字段
- 新增 README.md（完整项目文档）：
  - 核心特性（4 大 AI 能力 + 14 大功能模块）
  - 训练细节增强（今日焦点/倒计时/热身冷身/单次分析/导出/校验）
  - 技术栈 + 项目结构 + 数据模型
  - 快速开始 + 使用指南
  - 折线图趋势分析专章说明

Stage Summary:
- 验证通过（真实截图测试）：
  - 增强后 VLM 提取真实华为运动健康截图：
    - 基础数据：距离 10km / 时长 3395秒 / 配速 5:40/km / 心率 167-186 / 爬升 18.3m
    - 跑姿数据：步频 164 / 步幅 107cm / 步数 9313 / VO2max 72 / 心率恢复 26 / 触地时间 257ms / 垂直振幅 9.5cm / 左右平衡 49.9%
    - 5 类折线图：心率曲线(20点) / 配速曲线(20点) / 步频曲线(20点) / 海拔曲线(20点) / 分段配速(10点)
    - curveAnalysis：详细趋势描述（心率漂移/配速前快后慢/步频稳定/海拔平缓）
  - 所有数据成功解析并持久化到 rawExtract
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- dev server 在本环境不稳定（环境问题，非代码问题）
- 配速计算器基于通用系数，个体差异需结合实际训练调整

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 17 个 Task 已完成
- QA 测试：server 状态检查，runner/weeks/goal API 均 200 响应
- 新功能1：PB 个人最好成绩记录（RecordsView）
  - 扩展 Prisma schema：PersonalRecord 模型（distance 唯一/distanceKm/timeSec/date/location/raceName/paceSec/notes），已 db:push
  - 新增 API /api/records：GET 返回所有标准距离（1K/3K/5K/10K/半马/全马，无记录则占位）/ POST 保存或更新某距离 PB（upsert by distance）
  - 新增 API /api/records/[id] DELETE：删除 PB 记录
  - 新增组件 src/components/views/records-view.tsx：
    - 头部汇总（已记录数/最快配速/最长距离）
    - 6 个距离卡片网格（1K/3K/5K/10K/半马/全马，各有专属配色与图标）
    - 有记录：显示时间/配速/日期/赛事名/地点 + 悬停编辑/删除
    - 无记录：占位 + 添加按钮
    - 编辑对话框：时间(时:分:秒)/日期/赛事名/地点/备注
  - 主页面新增「PB 记录」Tab（第 10 个 Tab）
  - 验证：保存 5K 20:00、10K 47:00、全马 3:45:00 三个 PB，API 返回正确
- 新功能2：训练配速计算器（PaceCalculatorView）
  - 新增 src/lib/pace-calculator.ts：
    - 基于 Riegel 公式从目标赛事成绩反推阈值配速（10K 配速）
    - 8 个训练区间配速计算（恢复/轻松/长距离/马拉松/节奏/阈值/间歇/重复）
    - 各区间采用业界通用系数（恢复1.35/轻松1.25/长跑1.20/马拉松1.06/节奏1.02/阈值1.0/间歇0.95/重复0.88）
    - 各距离预估时间（5K/10K/半马/全马 互推）
  - 新增组件 src/components/views/pace-calculator-view.tsx：

## 2026-08-23 · 训练周期体系 + 3 个用户反馈 Bug 修复 + v1.1.0 发布
- 新功能：训练周期（TrainingPlan）实体 + TrainingWeek.planId
  - 生成课表（/api/plan、/api/chat-plan、/api/templates）防重复：命中已有「下周」直接复用，不再重复建周
  - 同一时间仅一个「当前启用」计划；新周自动归入启用计划
  - 历史归档页按周期分组折叠展示，支持删除周期 / 删除单周（含周详情页）
- Bug 修复：离线模式「AI 单次训练分析」按钮恒灰无法点击
  - 根因：离线 GET /api/sessions/[id]/detail 的 completion 嵌在 session 内部、顶层缺失，按钮 disabled 恒真；POST 返回 content 而前端读 analysis
  - 修复：GET 响应对齐 server（顶层 completion + curves），POST 返回 analysis
- 数据保留：离线 SQLite 自动迁移（补 TrainingPlan 表 + planId 列 + 遗留周归默认周期），覆盖安装不丢数据
- 发布 GitHub Release v1.1.0（CI 自动构建 app-debug.apk 11.5MB）
- ci: build-apk.yml 增加 tags: ['v*'] 触发 + permissions: contents: write（修复 403）

## 2026-08-23 · 修复 APK 无法覆盖安装（版本冲突）
- 现象：用户手机装 v1.0.0 后，下载 v1.1.0 安装报「版本冲突」
- 根因：CI 每次构建用临时 runner 的 debug.keystore（每次签名不同）；且 v1.0.0 的签名密钥（证书 ac37639a）不在本机，与本地 keystore（证书 94:90:E7）不一致
- 修复：
  - 本地 debug.keystore 存入 GitHub Secret（ANDROID_DEBUG_KEYSTORE_BASE64，libsodium sealed box）
  - build.gradle 显式指定 debug 签名使用 ~/.android/debug.keystore（绕过 AGP 默认查找）
  - workflow 构建前写入 keystore（mkdir + printf | base64 -d，修复 ~/.android 目录缺失导致的写入失败）
  - versionCode 1→2，versionName 1.0→1.1.0
  - CI 用 apksigner 打印签名证书：v1.1.0 证书 9490e7a4… = 本地 keystore 94:90:E7（已验证一致）
- 结果：v1.1.0 起签名固定；v1.0.0 密钥缺失，用户需卸载旧版 + 导出/导入数据升级一次，此后升级不再冲突


    - 输入区：目标赛事选择 + 时:分:秒时间输入 + 5 个快捷预设（全马330/400/半马145/10K50/5K25）
    - 各距离预估成绩卡（Riegel 公式）
    - 8 个配速区间卡片（专属配色，含配速/范围/心率区间/说明）
    - 复制配速表功能
    - 配速计算说明
  - 主页面新增「配速计算器」Tab（第 11 个 Tab）
  - 验证：全马 3:45:00 计算出 轻松跑6:08/马拉松配速5:12/节奏跑5:00/阈值4:54/间歇4:39/重复4:19/长跑5:53/恢复跑6:37，符合专业训练区间

Stage Summary:
- 验证通过（curl API + Prisma 直接测试 + 配速逻辑测试）：
  - records GET 200：返回 6 个标准距离，含 3 个已记录 PB
  - records POST 200：保存 5K PB（20:00, 4:00/km）成功
  - 配速计算器逻辑测试：全马 3:45:00 → 8 区间配速正确
  - ESLint 通过（0 error 0 warning）
- 注意：dev server 在本环境仍不稳定，编译新路由时偶尔崩溃，需 setsid 重启

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限
- dev server 在本环境不稳定（环境问题，非代码问题）
- 配速计算器基于通用系数，个体差异需结合实际训练调整

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 16 个 Task 已完成
- QA 测试：server 状态检查，runner/weeks/goal API 均 200 响应
- 新功能1：热身/冷身指导（WarmupCooldownDialog）
  - 新增 src/lib/warmup-cooldown.ts：根据训练类型/强度/距离动态生成热身冷身方案
    - 热身步骤（按强度区分）：高强度=慢跑+动态拉伸+加速跑+激活；长距离=慢跑+动态拉伸+关节激活；轻松=简短慢跑+拉伸
    - 冷身步骤：高强度=慢跑冷身+步行；长距离=慢跑/步行；轻松=慢跑/步行
    - 静态拉伸：股四头肌/腘绳肌/小腿/臀部/髂胫束（高强度+髋屈肌+足底，长距离+下背部+比目鱼肌）
    - 热身/冷身提示（按类型个性化）
    - 目标心率计算（基于 Karvonen 储备心率法）
  - 新增组件 src/components/views/warmup-cooldown-dialog.tsx：
    - 顶部目标数据卡（配速/心率/距离）
    - 热身方案区（橙色主题，WARM UP 标签，编号步骤+时长+详细说明+提示）
    - 冷身方案区（蓝色主题，COOL DOWN 标签，步骤+提示）
    - 静态拉伸区（绿色主题，2列网格，目标肌群+时长）
    - 个性化提醒
  - Dashboard 每张训练卡片增加「查看热身/冷身指导」入口（橙色链接）
- 新功能2：赛事实时倒计时卡片（RaceCountdown）
  - 新增组件 src/components/views/race-countdown.tsx：
    - 实时倒计时（天/时/分/秒，每秒更新）
    - 5档紧迫度配色：
      - 比赛日（≤0天）：玫红渐变+脉冲+跑道线装饰+"比赛日已到来"
      - 比赛周（≤7天）：红橙渐变+脉冲
      - 冲刺阶段（≤30天）：橙黄渐变
      - 备战阶段（≤90天）：翠绿青蓝渐变
      - 长期备战（>90天）：靛蓝紫蓝渐变
    - 装饰：模糊光晕圆 + SVG 跑道线
    - 内容：赛事名称+目标成绩+比赛日期+4格倒计时+剩余天数/周数
  - Dashboard 在今日焦点卡片下方展示（仅当有目标日期时）

Stage Summary:
- 验证通过（agent-browser 视觉测试 + VLM 评估）：
  - 赛事倒计时：全马目标 3:45:00，2026年12月6日，132天22时56分42秒实时倒计时，靛蓝渐变"长期备战"
  - 热身指导：轻松跑 Z2 目标心率 134-148 bpm，热身8-10分钟（慢跑+动态拉伸），冷身8-10分钟，5项静态拉伸
  - VLM 评价赛事倒计时："极强的视觉锚点，能有效激发用户的紧迫感"
  - VLM 评价热身指导："视觉引导极佳，具备很高的实操价值，能有效帮助跑者科学训练并预防运动损伤"
  - 无控制台错误
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限
- dev server 在本环境不稳定（环境问题，非代码问题）
- 赛事倒计时假设早 8 点开赛，实际应支持自定义开赛时间

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 15 个 Task 已完成
- QA 测试：server 状态检查，runner/weeks/recovery API 均 200 响应
- 新功能1：数据导入导出（DataView）
  - 新增 API /api/data/export：导出全部数据为 JSON（跑者/课表/完成记录/跑鞋/使用记录/恢复记录/AI点评）
  - 新增 API /api/data/import：导入 JSON 数据，支持合并/替换两种模式
    - 合并模式：跳过已存在的周，仅导入新数据
    - 替换模式：清空当前所有数据后导入
  - 新增组件 src/components/views/data-view.tsx：
    - 导出备份：一键下载 JSON 文件（含数据大小提示）
    - 导入数据：拖拽/点击选择文件 → 预览数据统计（跑者/周/课/完成/跑鞋/恢复）→ 选择模式（合并/替换）→ 确认导入 → 显示导入结果
    - 危险操作区：清空所有数据（双重确认）
    - 数据安全提示
  - 主页面新增「数据管理」Tab（第 12 个 Tab）
- 新功能2：仪表盘今日训练焦点卡片（TodayFocusCard）
  - Dashboard 顶部新增渐变色焦点卡片，置顶显示今日训练
  - 三种状态配色：
    - 待完成：橙红渐变（amber→orange→rose），待完成 Badge 脉冲动画
    - 已完成：翠绿渐变（emerald→teal），显示实际数据
    - 休息日：深灰渐变
  - 内容：大图标 + 训练类型 + 描述 + 3 个关键数据（距离/配速/心率或强度）+ 操作按钮（上传/查看详情）+ 已完成额外信息（时长/爬升/天气/RPE/体感）
  - 装饰：模糊光晕圆，提升视觉层次
  - 验证：周日恢复跑正确显示，VLM 评价"视觉抓取力极强、极高的专业水准"

Stage Summary:
- 验证通过（curl API + agent-browser 视觉测试）：
  - export GET 200：返回完整数据（3周/22sessions/1completion/2shoes/1recovery）
  - import POST 200：合并模式正确跳过已有 runner
  - TodayFocusCard 渲染正确：周日恢复跑 5km Z1，橙红渐变，待完成 Badge 脉冲
  - 数据管理 Tab：导出备份/导入数据/清空 三区完整
  - VLM 评价 dashboard："极高的专业水准"
  - 无控制台错误
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限
- dev server 在本环境不稳定（环境问题，非代码问题）
- 导入数据时图片 base64（imageDataUrl）会增大 JSON 文件体积，大容量时可能影响性能

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据 CSV 导入（从其他平台批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 14 个 Task 已完成
- QA 测试：server 状态检查，runner/shoes API 均 200 响应
- 新功能1：训练计划模板库（TemplatesView）
  - 新增 src/lib/templates.ts：5 套预设训练计划
    - 全马完赛计划（入门）4:30:00 / 16周 / 40km
    - 全马 Sub 3:30 计划（进阶）/ 16周 / 60km
    - 半马 Sub 1:30 计划 / 12周 / 45km
    - 10K Sub 50 计划（入门）/ 8周 / 30km
    - 10K Sub 40 计划（进阶）/ 10周 / 50km
    每套含：阶段划分（base/build/peak/taper）+ 典型周课表
  - 新增 API /api/templates：GET 列表 / POST 应用模板生成新一周课表
  - 新增组件 src/components/views/templates-view.tsx：
    - 头部汇总（模板数/覆盖赛事/难度等级/周期长度）
    - 模板卡片：名称/难度/目标/周期/周跑量/阶段进度条
    - 展开详情：训练阶段说明 + 示例周课表（每日训练课）
    - 一键应用按钮（生成新一周）
  - 主页面新增「计划模板」Tab（第 7 个 Tab）
- 新功能2：营养与恢复追踪（RecoveryView）
  - 扩展 Prisma schema：RecoveryLog 模型（睡眠/睡眠质量/饮水/营养/肌肉酸痛/疲劳/情绪/跑前中后补给/备注），已 db:push
  - 新增 API /api/recovery：GET 最近 N 天记录+汇总 / POST 保存某日记录（upsert by date）
  - 新增组件 src/components/views/recovery-view.tsx：
    - 头部汇总 4 指标（平均睡眠/饮水/疲劳/记录天数）
    - 左侧表单：日期选择 + 4 分区（睡眠/补水营养/身体状态/训练补给）
      - 睡眠时长 + 质量滑块
      - 饮水量 + 营养评分滑块
      - 肌肉酸痛/疲劳/情绪 3 个滑块（含 5 档描述）
      - 跑前/跑中/跑后补给
      - 备注
    - 右侧趋势图表：睡眠趋势(双轴)/饮水柱状/体感三线/最近记录列表
  - 主页面新增「恢复追踪」Tab（第 9 个 Tab）

Stage Summary:
- 验证通过（curl API + Prisma 直接验证）：
  - templates GET 200：返回 5 套模板
  - templates POST 200：应用 10K Sub 50 模板，成功生成第 3 周（build 期，7 sessions）
  - recovery GET 200：返回空列表+汇总
  - recovery POST 200：保存恢复记录（sleep=7.5h, quality=4, water=2L, fatigue=3, mood=4）
  - recovery 数据持久化验证通过
- ESLint 通过（0 error 0 warning）
- 注意：dev server 在本环境仍不稳定，编译新路由时偶尔崩溃，需 setsid 重启

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限
- dev server 在本环境不稳定，频繁请求可能崩溃（环境问题，非代码问题）
- 模板应用总是生成"下周"，多次应用会创建同周不同 weekNumber 的记录（实际使用逐周应用无冲突）

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 恢复数据与训练关联分析（恢复差时自动建议减量）
6. 训练数据导入导出（CSV/Excel 批量导入历史数据）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 13 个 Task 已完成
- QA 测试：server 状态检查，各 API 验证（runner/weeks/goal/shoes 均 200）
- 新功能1：跑鞋与训练完成自动关联
  - 扩展 Prisma schema：TrainingCompletion 增加 shoeId 字段，已 db:push
  - 更新 API /api/sessions/[id]/complete：
    - 接收 shoeId 参数，保存到 completion 记录
    - 跑鞋变化时：删除旧 ShoeUsage，创建新 ShoeUsage（自动累计里程）
    - 同跑鞋时：更新现有 ShoeUsage 的 distance
  - 更新 upload-view.tsx：
    - 表单 state 增加 shoeId
    - 加载在役跑鞋列表（useEffect fetch /api/shoes）
    - 跑鞋选择 Select（显示名称/品牌/当前里程/寿命/磨损百分比）
    - 磨损≥85% 选项加 ⚠️ 警告
    - 选中高磨损跑鞋时显示警告提示条
    - 保存时 shoeId 加入 payload
  - 验证：complete API 保存 shoeId 成功，ShoeUsage 自动创建，Nike Pegasus 40 里程从 0→10km
- 新功能2：课表导出为 Markdown 与 PDF
  - 新增 src/components/views/export-utils.ts：
    - weekToMarkdown(week, runner)：生成完整 Markdown 课表（概览+每日表格）
    - copyToClipboard(text)：复制到剪贴板
    - downloadTextFile(text, filename)：下载 .md 文件
    - printWeek(week, runner)：打开新窗口生成精美 HTML 课表并触发打印（可另存为 PDF）
      - 含品牌色头部、跑者信息、4 项统计卡片、7 行训练表格、按类型着色
  - Dashboard 周概览卡片标题区增加 3 个导出按钮：
    - 📋 复制（Markdown 到剪贴板）
    - ⬇️ Markdown（下载 .md 文件）
    - 🖨️ 打印/PDF（打开打印对话框）
- 样式打磨：
  - 跑鞋选择选项显示磨损百分比，高磨损加 ⚠️
  - 选中高磨损跑鞋时显示琥珀色警告提示条
  - 导出按钮组分三种颜色（灰/灰/绿）区分功能

Stage Summary:
- 验证通过（curl API + 直接 Prisma 测试）：
  - complete API 带 shoeId：completion.shoeId 保存成功，ShoeUsage 自动创建
  - shoes API 返回更新后统计：Nike Pegasus 40: 10km/800km (1%) usage=1
  - 跑鞋里程自动累计功能完全正常
  - 导出工具函数 weekToMarkdown/printWeek 逻辑正确（lint 通过）
- ESLint 通过（0 error 0 warning）
- 注意：dev server 在本环境仍不稳定，编译新路由时偶尔崩溃，需 setsid 重启

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限
- dev server 在本环境不稳定，频繁请求可能崩溃（环境问题，非代码问题）
- 跑鞋使用记录现已与训练完成自动关联，但删除完成记录时未自动清理 ShoeUsage（可后续优化）

## 下一阶段建议（优先级排序）
1. 多用户支持（NextAuth + 数据隔离）
2. 移动端 PWA 适配（离线查看课表）
3. 训练提醒（WebSocket 实时推送当日训练提醒）
4. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）
5. 训练计划模板库（预设全马/半马/10K 训练计划）
6. 营养与恢复追踪（睡眠/补水/补给记录）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 12 个 Task 已完成
- QA 测试：7 个 Tab 逐一切换，无控制台错误，无横向滚动，服务器 200 响应
- 新功能1：训练目标进度追踪（GoalView）
  - 新增 API /api/goal：
    - 基于 Riegel 公式（T2 = T1 * (D2/D1)^1.06）预估 10K/半马/全马完赛时间
    - 达标概率评估（5档：保守/合理/挑战/激进/过于激进）
    - 训练阶段建议（基础期/强化期/巅峰期/减量期/比赛周，基于剩余周数）
    - 最近4周训练统计 + 累计统计 + 周跑量趋势（含目标线）
    - 配速对比（预估配速 vs 目标配速，差值秒数）
  - 新增组件 src/components/views/goal-view.tsx：
    - Hero 卡片（渐变背景 + 达标概率进度条）
    - 训练阶段建议卡
    - 完赛时间预估（10K/半马/全马 3 卡，全马高亮主要目标）
    - 最近4周 + 累计统计 2 卡
    - 周跑量趋势面积图（含目标周跑量参考线）
  - 主页面新增「目标进度」Tab（第 6 个 Tab）
  - 修复：种子数据 targetDate 从 2025-12-07 更新为 2026-12-06（避免过期）
- 新功能2：跑鞋里程追踪（ShoesView）
  - 扩展 Prisma schema：Shoe（跑鞋）+ ShoeUsage（使用记录）模型，已 db:push
  - 新增 API /api/shoes（GET 列表+统计 / POST 新增）+ /api/shoes/[id]（PATCH 更新 / DELETE 删除 / POST 记录里程）
  - 新增组件 src/components/views/shoes-view.tsx：
    - 汇总统计 4 指标（跑鞋总数/累计里程/平均磨损/需关注）
    - 在役/退役跑鞋分区展示
    - 跑鞋卡片：磨损进度条（颜色随磨损程度变化）+ 状态徽章（正常/即将到期/已超期/已退役）+ 购买/最后使用日期
    - 添加/编辑/退役/删除/记录里程 全功能
    - 2 个对话框：ShoeEditDialog（跑鞋信息）+ ShoeUsageDialog（里程记录）
  - 主页面新增「跑鞋追踪」Tab（第 7 个 Tab）
- Bug 修复：Prisma client 缓存问题
  - 问题：db:push 添加 Shoe 模型后，dev server 的 globalForPrisma.prisma 缓存了旧实例（无 shoe 属性），导致 /api/shoes 500
  - 修复：src/lib/db.ts 增加 schema 变化检测，若旧实例缺少 shoe 模型则 $disconnect 并重建
  - 注意：Turbopack 的 require.cache 不可靠，最终通过重启 dev server 解决
- 环境问题记录：dev server 在频繁请求/agent-browser 连接时不稳定，会崩溃退出，需 setsid 重启

Stage Summary:
- 验证通过（curl API 测试）：
  - /api/goal 200：返回完整目标进度数据（剩余133天/19周，全马预估4h51m，配速6:54/km，达标概率5%）
  - /api/shoes GET 200：返回跑鞋列表含统计（Nike Pegasus 40: 0km/800km 0% active）
  - /api/shoes POST 200：成功创建跑鞋（Nike Pegasus 40, Test Shoe）
  - /api/shoes/[id] POST 200：记录里程功能正常
  - 目标进度 Tab、跑鞋追踪 Tab 渲染正常
- ESLint 通过（0 error 0 warning）
- 注意：agent-browser 在本环境会导致 dev server 崩溃，改用 curl 验证 API

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限
- dev server 在本环境不稳定，频繁请求可能崩溃（环境问题，非代码问题）
- 跑鞋使用记录目前需手动添加里程，未与训练完成记录自动关联

## 下一阶段建议（优先级排序）
1. 跑鞋与训练完成自动关联（上传完成数据时选择跑鞋，自动累计里程）
2. 课表导出为图片/PDF（便于分享给教练）
3. 多用户支持（NextAuth + 数据隔离）
4. 移动端 PWA 适配（离线查看课表）
5. 训练提醒（WebSocket 实时推送当日训练提醒）
6. 跑鞋寿命 AI 建议（基于跑者体重/跑量/路面推荐换鞋时机）

Work Log:
- 读取 worklog.md 了解项目进展，确认前序 11 个 Task 已完成
- QA 测试：
  - 6 个 Tab 逐一切换，无控制台错误（__errs=[]）
  - 无横向滚动（scrollW == innerW == 1280）
  - 服务器全部 200 响应
- 新功能1：训练日历视图（CalendarView）—— 月度 Heatmap
  - 新增 API /api/calendar：按月聚合每天的训练情况（含跨月周查询）
  - 新增组件 src/components/views/calendar-view.tsx：
    - 月份导航（上一月/下一月/今天）
    - 月度统计 4 指标（月总距离/训练次数/活跃天数/最长单次）
    - 日历网格：7×N 格子，按训练强度着色（无训练/待完成/5档距离渐变 emerald）
    - 今日高亮 ring、选中日期详情面板
    - 颜色图例
  - 主页面新增「训练日历」Tab（第 5 个 Tab）
- 新功能2：单次训练详情对话框（SessionDetailDialog）
  - 新增 API /api/sessions/[id]/detail：
    - GET：获取完整详情（计划/完成数据/rawExtract 折线图）
    - POST：AI 单次训练深度分析
  - 新增 lib/ai.ts 中 analyzeSingleSession 函数（LLM 调用，生成 markdown 5 章节分析）
  - 新增组件 src/components/views/session-detail-dialog.tsx：
    - 计划 vs 实际 4 大数据卡片（距离/时长/配速/心率）
    - 详细数据网格（爬升/步频/卡路里/天气/温度/RPE/体感/强度）
    - 训练内容描述 + 体感备注
    - 原始训练截图展示
    - VLM 识别的折线图（配速/心率/海拔曲线）
    - AI 单次训练深度分析（训练评分/配速分析/心率分析/主观体感/训练建议）
  - Dashboard 已完成卡片增加「查看详情与 AI 分析」入口
  - History 详情页已完成训练增加「查看完整详情与 AI 分析」入口
- Bug 修复：日历月份解析
  - 问题：前端传 month=7（1-12），后端 new Date(year, 7, 1) 误作 8 月
  - 修复：后端 parseInt(monthParam) - 1 转为 0-11

Stage Summary:
- 验证全部通过：
  - 训练日历 Tab：加载成功，/api/calendar 200，正确显示 2026年7月，7/20 格子显示 8.0km
  - 日历点击日期：弹出详情面板，显示该日所有训练课（轻松跑/已完成/实际8km）
  - 单次详情对话框：GET /api/sessions/[id]/detail 200 (879ms)，显示完整数据 + 折线图
  - AI 单次分析：POST /api/sessions/[id]/detail 200 (8.5s)，生成 5 章节 markdown 分析
  - 7 Tab 切换无控制台错误
  - VLM 评价日历："极高的产品完成度和专业感"
- ESLint 通过（0 error 0 warning）

## 2026-08-23 · 独立历史训练记录 TrainingLog + 创建课表入口 + 修复移动端「更多」导航
### 背景（用户反馈）
- 用户反馈 v1.1.0「没有创建课表的页面」，并希望：既能选模板、又能 AI 对话生成课表；能在日历页方便地上传/批量补录前些日子的训练数据（明确日期），AI 据此生成课表。

### 改动
- 数据层：新增独立 TrainingLog 表（在线 Prisma model + 离线 SQLite DDL，migrateSchema 幂等建表）
  - 不绑定课表、只带日期；字段：date/distance/duration/avgPace/avgPaceSec/avgHr/maxHr/elevation/cadence/calories/weather/temperature/rpe/feeling/feelingNote/imageDataUrl/rawExtract/notes/shoeId/source
  - offline/db.ts 新增 logsBetween / logsRecentDays / insertLog / deleteLog 辅助
- API 双端：
  - 在线：新增 /api/log（GET ?from/to/recent、POST）、/api/log/[id]（DELETE）
  - 离线：handlers/core.ts 新增 logHandler/logDetailHandler，registerCoreHandlers 注册 GET/POST /api/log、DELETE /api/log/[id]
- 日历：
  - 在线 /api/calendar 与离线 compute.ts calendarHandler 合并 TrainingLog（source='log'，计入 totalDistance/completedCount/monthStats）
  - 日历详情面板：新增「补录该日训练」按钮（跳转上传并预填日期）；补录记录紫色标识 + 可删除；无训练记录的日期也显示补录入口
- 上传：
  - upload-view 新增两种模式：绑定本周训练课 / 补录历史训练（指定日期，默认今天或由日历带入日期）
  - 补录模式保存走 POST /api/log（复用 OCR 提取 / 自动填表）
- AI 生成课表参考历史训练：
  - lib/ai.ts 与 lib/offline/ai.ts 的 generateNextWeekPlan / generatePlanFromChat 新增 recentLogs 参数，prompt 注入「近期实际训练记录（含日期）」，要求据此评估疲劳与强度
  - 在线 plan/chat-plan route、离线 planHandler/chatPlanHandler 读取最近 14 天 TrainingLog 传入
- 创建课表入口 + 导航：
  - 修复移动端底部「更多」按钮 bug（原 onClick 直接 setTab('history')，导致进不了其他功能）→ 新增 'more' Tab + MoreView 网格菜单（计划模板/趋势/日历/目标/跑鞋/恢复/PB/配速/成就/历史/档案/数据）
  - DashboardView 空状态（无本周课表）新增「从计划模板创建」「AI 对话生成」两个醒目按钮

### 验证
- prisma generate / db:push 通过；next build 通过（/api/log 与 /api/log/[id] 已生成）
- 在线冒烟：POST /api/log 创建 → GET /api/log?recent=30 查询 → GET /api/calendar 合并显示 source='log' 记录（totalDistance 计入）→ DELETE /api/log/[id] 删除，全部通过
- tsc 全量检查未引入新的类型错误（项目存在既有类型警告，构建本就跳过类型校验）

### 说明
- 补录历史训练目前接入：日历展示 + AI 生成课表上下文；统计/负荷/趋势等视图尚未纳入 TrainingLog（可后续扩展）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性
- SQLite 单文件数据库，适合个人使用
- 暂无用户认证（单用户模式）
- 趋势/日历图表在数据量少时直观度有限，随训练累积会改善

## 下一阶段建议（优先级排序）
1. 训练目标进度追踪（距目标赛事剩余周数、当前预估完赛时间、达标概率）
2. 课表导出为图片/PDF（便于分享给教练）
## 2026-08-23 · 打包 v1.2.0（APK + Windows EXE）+ 字体本地化
- 版本升级：APK versionCode 3 / versionName 1.2.0；桌面版 desktop/package.json 1.2.0
- 字体本地化：next/font/google（Geist）改用 geist npm 包（本地字体文件），彻底摆脱 Google Fonts 网络依赖（此前本地/CI 构建会因访问 fonts.googleapis.com 失败而中断）
- 本地产物：
  - APK：android/app/build/outputs/apk/debug/app-debug.apk（42.9MB，签名 SHA-256 9490e7a4 固定 keystore，可覆盖安装）
  - EXE：desktop/release/PaceOn Setup 1.2.0.exe（NSIS 安装器）+ PaceOn 1.2.0.exe（便携版）
- 构建环境：本机 Android SDK（F:\android_studio\sdk）+ JDK21（F:\java\jdk-21.0.12+8）；Gradle 8.14.3 复用旧 hash 缓存目录绕过 wrapper 网络下载
- 发布：push tag v1.2.0 触发 CI 自动构建 APK 并创建 GitHub Release；本地 EXE 上传 Release（需 GITHUB_TOKEN）

3. 多用户支持（NextAuth + 数据隔离）
4. 移动端 PWA 适配（离线查看课表）
5. 训练提醒（WebSocket 实时推送当日训练提醒）
6. 跑鞋里程追踪（跑鞋寿命管理，预防伤病）

Work Log:
## 2026-08-23 · 修复 v1.2.1：AI 对话生成入口 + 手机顶部安全区
- 修复：无课表时点击首页「AI 对话生成」只跳到 AI 点评但页面无任何按钮
  - 根因：ReviewView 在 week 为空时直接返回「暂无课表」空态，未渲染对话入口
  - 修复：无课表时直接渲染 ChatPlanView（对话式生成不依赖课表，fromWeekId 可选），带说明头
- 修复：手机（Android 15+，targetSdk 36 强制 edge-to-edge）UI 顶到屏幕顶部/刘海区
  - 新增 .pt-safe/.pb-safe（env(safe-area-inset-top/bottom)）到 globals.css
  - 顶部 header 应用 pt-safe；底部导航已有 pb-safe
  - StatusBar 背景色由 #10b981 改 #ffffff 与白色 header 协调（style DARK）
- 版本升级 v1.2.1（APK versionCode 4 / versionName 1.2.1，桌面版 1.2.1）
- 发布：tag v1.2.1 触发 CI 构建 APK + 创建 Release；EXE 本地产物上传需 GITHUB_TOKEN（脚本已更新 v1.2.1）

- 读取 worklog.md 了解项目进展，确认前序 10 个 Task 已完成
- QA 测试：
  - 数据库状态检查：2 周 / 14 节课 / 1 完成记录 / 2 AI review，数据正常
  - 6 个 Tab 逐一切换，无控制台错误（__errs=[]）
  - 无横向滚动（scrollW == innerW == 1280）
  - 页脚布局正常（mt-auto + flex-1）
  - 服务器全部 200 响应
  - VLM 评估 dashboard UI：视觉层次清晰、配色舒适、建议增加可视化元素
- 新功能1：训练趋势分析视图（TrendsView）
  - 新增 API /api/stats：跨周聚合统计（周跑量/配速/心率/RPE/体感/完成率）+ 训练类型分布 + 心率区间分布
  - 新增组件 src/components/views/trends-view.tsx：
    - 总览 4 大指标（累计距离/时长/平均配速/训练周数）
    - 周跑量趋势面积图（实际 vs 计划）
    - 平均配速趋势折线图
    - 平均心率趋势折线图
    - RPE 与体感双折线趋势图
    - 训练类型分布饼图
    - 心率区间分布柱状图（基于 Karvonen 法）
    - 周完成率柱状图（按 phase 着色）
    - 周度训练数据明细表格
  - 主页面新增「趋势分析」Tab（第 4 个 Tab）
- 新功能2：课表手动编辑功能
  - 新增 API 支持：sessions POST（新增）/ PATCH（编辑）/ DELETE（删除）已就绪
  - 新增组件 src/components/views/session-edit-dialog.tsx：
    - 模态对话框，支持编辑/新增/删除训练课
    - 字段：训练日/类型/距离/时长/配速/强度/描述
  - Dashboard 每张训练卡片增加悬停显示的「编辑」按钮（opacity-0 group-hover:opacity-100）
  - 「每日训练」标题栏增加「新增」按钮
- 新功能3：周进度环可视化
  - 新增组件 src/components/views/progress-ring.tsx（SVG 圆环）
  - Dashboard 周概览卡片用进度环替代纯数字展示，颜色随完成率变化（≥80% 绿/≥50% 橙/红）
  - 圆环中心显示实际/计划距离
- 新功能4：上传表单数据合理性校验
  - 单字段校验（getFieldWarn）：距离/时长/心率/爬升/步频/卡路里/温度/配速 范围检查，异常时字段标签旁显示⚠
  - 跨字段一致性校验（ValidationWarnings）：
    - 平均心率 > 最大心率 → ⛔ error
    - 配速与距离/时长不一致（偏差>15%）→ ⚠️ warn 并给出计算值
    - 最大心率异常范围 → ⚠️ warn
- 样式打磨：
  - Dashboard 卡片悬停效果升级：hover:shadow-lg + hover:-translate-y-0.5 + duration-200
  - 今日卡片增加 shadow-emerald-100
  - 历史详情头部加渐变背景
  - 周概览卡片加渐变背景

Stage Summary:
- 验证全部通过：
  - 趋势分析 Tab：加载成功，/api/stats 200 (122ms)，6 类图表渲染正常
  - 课表编辑：点击编辑→修改距离 18→20km→保存→✅ 已更新，课表数据持久化
  - 课表新增：填写表单→保存→✅ 已新增训练课，课表从 7→8 节
  - 进度环：SVG 圆环正确渲染，颜色随完成率变化
  - 数据校验：avgHr=190 > maxHr=160 → ⛔ 提示；配速 4:00 vs 实际 6:15 → ⚠️ 提示
  - VLM 评价 dashboard："成熟的产品设计水准"
  - 6 Tab 切换无控制台错误
- ESLint 通过（0 error 0 warning）

## 未解决问题 / 风险
- VLM 识别精度依赖于上传图片的清晰度与数据可读性；真实 App 截图效果优于 AI 测试图
- SQLite 单文件数据库，适合个人使用，多用户场景需迁移
- 暂无用户认证（单用户模式）
- 趋势分析图表在数据量少时（1-2 周）趋势线不明显，属正常现象，随训练累积会改善

## 下一阶段建议（优先级排序）
1. 训练日历视图（月度 Heatmap，直观展示每日训练强度）
2. 课表导出为图片/PDF（便于分享给教练）
3. 单次训练详情页（展示完整折线图 + 分段配速 + AI 单次分析）
4. 训练目标进度追踪（距目标赛事剩余周数、当前预估完赛时间）
5. 多用户支持（NextAuth + 数据隔离）
6. 移动端 PWA 适配（离线查看课表）

## 2026-08-14 · 项目改名 PaceOn + GitHub Release + 文案去 AI 味
- 项目/仓库/应用改名为 PaceOn（GitHub: JustPlayinger/PaceOn），Android 包名 com.paceon.app
- README 去除营销味措辞（AI 驱动/智能等改朴素描述），清理 Z.ai 残留配置说明
- 创建 GitHub Release v1.0.0，附 PaceOn-v1.0.0.apk（CI 构建）
- 修复：.gitignore 误改目录名导致 pacecoach-lite 被误提交为 gitlink
