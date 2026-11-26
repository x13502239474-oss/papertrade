# PaperTrade · A 股模拟交易终端

一款手机优先、免构建、可直接部署在 GitHub Pages 的 **A 股模拟交易网页终端**（原生 HTML / CSS / ES Modules）。

> **重要声明**：本应用**仅用于模拟交易练习与复盘**，不连接真实券商，不提交真实委托，也不构成任何投资建议。所有账户数据默认仅保存在当前浏览器的 `localStorage` 中。

---

## 架构与数据流

```text
GitHub Pages 静态站点 (/ashare/)
 ├── index.html / style.css          手机优先响应式终端（底部导航 / 桌面三栏）
 └── js/
      ├── core/                      纯函数业务内核（可直接在 Node 单元测试）
      │    ├── time.js               北京时间 (UTC+8) 时钟与日期工具
      │    ├── calendar.js           2025-2026 上交所休市日历 + 未内置年份降级提示
      │    ├── session.js            竞价时段判定与委托归属交易日
      │    ├── rules.js              沪深主板/创业板/科创板/北交所交易单位与涨跌幅规则
      │    ├── fees.js               可配置练习费用模型（佣金/印花税/过户费）
      │    ├── account.js            模拟下单、冻结、T+1、限价撮合、盈亏与复盘统计
      │    └── storage.js            localStorage 持久化、v1→v2 自动迁移、JSON 备份导入导出
      ├── data/                      行情 Provider 抽象层
      │    ├── provider.js           状态机（连接中/正常/延迟/非交易时段/限流/故障/演示）+ 缓存
      │    ├── tencent.js            腾讯财经公开快照（含五档盘口、分时、5日、日/周/月K）
      │    ├── sina.js               新浪财经公开板块榜单（沪深京/主板/创业板/科创板/北交所）
      │    ├── proxy.js              自定义后端代理 Provider（对接 worker/）
      │    ├── demo.js               静态收盘快照（非实时，无随机价格）
      │    └── catalog.js            常用 A 股代码与拼音缩写本地检索字典
      └── ui/
           ├── format.js             红涨绿跌、金额/股数/百分比格式化
           └── charts.js             轻量化交互式 SVG 分时/K 线/资产曲线

worker/（可选独立部署：Cloudflare Worker 后端代理）
 ├── wrangler.toml                   Worker 配置（仅放非敏感 vars）
 └── src/index.js                    安全持有 TUSHARE_TOKEN / ITICK_TOKEN，提供统一 JSON API + CORS + 边缘缓存
```

---

## 行情数据源、授权与限制说明

GitHub Pages 为纯静态托管，**不能**安全存放任何需要密钥的 API Key。本应用提供三种行情模式，可在页面内「数据源与设置」中随时切换：

| 模式 | 上游数据来源 | 费用与授权边界 | CORS / 前端直连 | 延迟与刷新频率 | 不可用时的行为 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **公开免费行情（默认）** | 腾讯财经 (`qt.gtimg.cn`, `web.ifzq.gtimg.cn`) + 新浪财经 (`vip.stock.finance.sina.com.cn`) | 面向网页展示的公开免费行情接口，**非交易所 Level-2 商业授权**，仅供个人学习与模拟练习，不适合高频或商业分发 | 响应头返回 `Access-Control-Allow-Origin: *`，GitHub Pages 可直接请求 | 延迟数秒至数十秒（新浪榜单有约 10s 缓存）；前端交易时段每 15s 轮询，休市时段暂停轮询 | 顶部立即显示「数据源故障」或「请求频率受限」警告条并给出重试 / 切换演示快照按钮，不伪装旧数字为实时 |
| **自定义后端代理（推荐进阶）** | 通过 `worker/` 代理转发至 **Tushare Pro (`rt_k`)**、**iTick** 或公开源 | • **Tushare Pro**：实时日线 `rt_k` 为独立付费权限（约 200 元/月，50 次/分），非普通积分免费接口<br>• **iTick**：个人免费版 $0/月，REST 限 5 次/分、WS 限 1 连接/3 标的 | 由 Worker `ALLOWED_ORIGINS` 控制，密钥仅存于 Worker Secret | 由上游订阅计划与 Worker `CACHE_TTL_SEC`（默认 5s）决定 | 透传 429/502 状态码，前端自动进入 30s 退避并提示故障 |
| **静态演示快照（离线）** | 内置 `js/data/demo.js`（2026-11-26 收盘参考样本） | 静态离线样本，无网络依赖 | 本地文件 | **非实时**，明确标注「演示行情」；无随机价格波动；不提供假 K 线图 | 始终可用作离线功能演示 |

> **不支持周期的处理**：公开源支持 **分时 / 5日 / 日K / 周K / 月K**；切换到 **60分** 或演示模式查看图表时，界面会明确提示“当前数据源暂不支持该周期，未以假数据补图”。

---

## 部署指南

### 1. 前端（GitHub Pages）

仓库根目录直接通过 GitHub Pages 发布（Settings → Pages → Deploy from a branch → `main` / `/(root)`），本页面无需构建步骤，访问路径为：

- `https://<username>.github.io/papertrade/ashare/`

本地预览（使用任意静态服务器即可，因使用 ES Modules 请勿直接用 `file://` 打开）：

```bash
npx serve . -l 4173
# 浏览器打开 http://localhost:4173/ashare/
```

### 2. 可选：部署 Cloudflare Worker 行情代理（安全托管 API Key）

若要接入 Tushare Pro 或 iTick，**严禁将密钥写入前端代码或 `wrangler.toml`**，请按以下步骤部署：

```bash
cd worker
# 1. 本地调试：复制根目录 .env.example 为 worker/.dev.vars（已加入 .gitignore）
cp ../.env.example .dev.vars

# 2. 登录并部署到 Cloudflare Workers
npx wrangler login
npx wrangler deploy

# 3. 通过 Secret 注入个人密钥（不会写入仓库）
npx wrangler secret put TUSHARE_TOKEN
# 或
npx wrangler secret put ITICK_TOKEN
```

在 `worker/wrangler.toml` 中将 `UPSTREAM` 改为 `tushare` 或 `itick`，并将 `ALLOWED_ORIGINS` 设为你的 GitHub Pages 域名后重新 `npx wrangler deploy`。随后在网页「数据源与设置」中选择“自定义后端代理”并填入 Worker URL（如 `https://papertrade-ashare-proxy.<subdomain>.workers.dev`）。

---

## 模拟交易规则与定价假设

1. **板块交易单位**（依据沪深北交易所《交易规则》）：
   - **沪深主板 & 创业板**：买入须为 **100 股整数倍**；卖出余额不足 100 股的零股须一次性申报。
   - **科创板**：买入不少于 **200 股**，超过部分可按 **1 股递增**；卖出余额不足 200 股时须一次性全部卖出。
   - **北交所**：买入不少于 **100 股**，超过部分可按 **1 股递增**；卖出余额不足 100 股时须一次性全部卖出。
2. **涨跌幅限制**：
   - 主板 10%（2026-07-06 起主板 ST/\*ST 风险警示股同样调整为 10%，此前按 5% 计算）；创业板与科创板 20%；北交所 30%。优先采用数据源返回的当日涨跌停价，缺失时按板块规则估算并标 `*`。
3. **T+1 制度与交易日历**：
   - 当日买入股份计入锁定批次，当日不可卖出；跨入下一交易日后自动进入可卖数量。
   - 内置 2025–2026 年上交所官方节假日休市安排（深交所、北交所同步）；未内置年份（如 2027 年）自动退化为“周一至周五为交易日”并在界面明确提示。
4. **模拟成交定价假设**：
   - 无逐笔撮合引擎，不模拟排队顺序、部分成交和成交量限制。
   - 买入参考卖一价（无盘口时取最新价），卖出参考买一价（无盘口时取最新价）；涨停无卖盘不能模拟买入，跌停无买盘不能模拟卖出。
   - 限价委托当日有效，收盘后未成交自动失效并解冻资金/股份；市价模拟仅在连续竞价时段可用（除非用户在设置中主动勾选“允许非交易时段练习成交”）。
5. **可配置费用模型（练习参数）**：
   - 默认参数：佣金 0.025%（最低 ¥5）、印花税 0.05%（仅卖出）、过户费 0.001%（沪深双向收取，北交所默认不计）。
   - **这些费率均为用户可修改的练习参数，不代表任何券商的实际收费标准**；每次下单确认前都会逐项列示估算依据。

---

## 自动化测试

使用 Node.js 内置测试运行器（无需额外安装依赖，Node 20+）：

```bash
node --test tests/*.test.mjs
```

测试覆盖：
- `tests/rules.test.mjs`：代码解析、四大板块识别、申报数量与零股规则、2026-07-06 主板 ST 涨跌幅新规、最大可买计算。
- `tests/calendar.test.mjs`：2026 年春节/国庆休市、周末跨日、交易时段划分、未知年份降级提示。
- `tests/fees.test.mjs`：最低佣金、卖出印花税、沪深/北交所过户费与自定义费率。
- `tests/account.test.mjs`：买入→T+1 锁仓→隔日卖出完整闭环、限价单撮合/撤单/收盘失效、涨停/非交易时段拦截、盈亏与资产曲线、多自选分组。
- `tests/storage.test.mjs`：旧版 `papertrade-ashare-state` (v1) 自动迁移至 v2、JSON 备份导入导出校验。
- `tests/providers.test.mjs`：真实采集的腾讯/新浪行情、指数、分时、周 K 线快照解析（含科创板成交量“股/手”单位校准）、429 限流与故障状态切换。

---

## 已知局限

- 浏览器直连公开行情源受上游风控与网络环境影响，高频刷新可能触发限流；建议个人长期使用时部署 `worker/` 代理做边缘缓存。
- 2027 年及之后的交易所法定节假日需待上交所每年 12 月公告后更新 `ashare/js/core/calendar.js`。
- 账户数据仅保存在当前浏览器 `localStorage`，不提供云端同步，请使用「设置 → 导出账户备份」自行保存。
