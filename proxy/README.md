# PaperTrade 服务端行情代理部署说明

## 为什么需要服务端代理？

GitHub Pages（`https://x13502239474-oss.github.io/papertrade/`）是完全公开的静态托管服务：
1. **密钥泄漏风险**：任何写入 HTML、JavaScript、配置文件或请求 URL 中的 API Key 均可被任何访客通过浏览器开发者工具直接读取并盗用，瞬间耗尽请求额度。
2. **数据展示许可限制**：Twelve Data、Finnhub、Polygon 等提供商的免费（Free / Basic）及个人自用套餐仅限**个人本地或内部自用（Personal / Internal Use）**，条款禁止使用个人免费密钥在公开网站向第三方访客展示或分发数据。

因此，PaperTrade 提供两种安全接入方式：
- **个人会话密钥模式（BYOK，无需后端）**：每位练习者在自己的浏览器“行情设置”中输入个人 API Key（仅存于当前标签页 `sessionStorage`，通过 `Authorization` 请求头发送，不入仓库、不入 URL）。
- **服务端安全代理模式（推荐具备商业展示授权的生产部署）**：通过 Cloudflare Workers 等无服务器平台托管 `cloudflare-worker.js`，将密钥保存在服务端加密环境变量中。

## Cloudflare Worker 部署步骤

1. 登录 Cloudflare Dashboard，创建一个新的 Worker（或使用 `wrangler` CLI）。
2. 将 `proxy/cloudflare-worker.js` 的内容部署到该 Worker。
3. 在 Worker **Settings → Variables and Secrets** 中添加：
   - **Secret（加密密钥）**：`TWELVE_DATA_API_KEY` = 你的 Twelve Data 服务端密钥（公开站点请确认已开通允许网页公开展示的商业计划，并在页面保留归属链接）。
   - **环境变量**：`ALLOWED_ORIGIN` = `https://x13502239474-oss.github.io`（本地调试可临时设为 `http://localhost:8080`）。
4. 复制 Worker 的 HTTPS 地址（如 `https://papertrade-quotes.<your-subdomain>.workers.dev`），在 PaperTrade 右上角 **行情设置 → 服务端安全代理** 中填入并连接。
