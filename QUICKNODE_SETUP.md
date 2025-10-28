# QuickNode + Lil' JIT 配置指南

## 为什么需要 QuickNode？

Jito 的公共 API 有严格的速率限制（1 请求/秒/IP/区域），在高峰期经常出现全局限流（globally rate limited），导致 Jito Bundle 功能无法使用。

使用 **QuickNode + Lil' JIT 插件**可以获得：
- ✅ 更高的速率限制
- ✅ 更稳定的服务
- ✅ 更好的性能

## 配置步骤

### 1. 注册 QuickNode 账户

访问 [QuickNode](https://www.quicknode.com/) 并注册账户。

### 2. 创建 Solana Mainnet 端点

1. 在控制面板中点击 "Create Endpoint"
2. 选择 **Solana**
3. 选择 **Mainnet**
4. 选择合适的套餐（推荐 Build 或更高）

### 3. 添加 Lil' JIT 插件

1. 在你的端点详情页面，找到 **Add-ons** 或 **Marketplace**
2. 搜索并添加 **Lil' JIT** 插件
3. 启用插件

### 4. 复制你的端点 URL

你的 QuickNode 端点 URL 格式如下：
```
https://example-name.solana-mainnet.quiknode.pro/YOUR_API_KEY/
```

### 5. 配置环境变量

编辑 `.env.local` 文件，添加你的 QuickNode 端点：

```bash
# Jito Bundle Endpoint (optional)
# 留空使用 Jito 公共 API (https://mainnet.block-engine.jito.wtf)
# 使用 QuickNode + Lil' JIT 插件时填写你的 QuickNode endpoint:
NEXT_PUBLIC_JITO_ENDPOINT=https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_API_KEY/
```

**注意**：
- 将 `your-endpoint` 和 `YOUR_API_KEY` 替换为你的实际值
- URL 末尾的 `/` 可加可不加（代码会自动处理）

### 6. 重启开发服务器

```bash
npm run dev
```

## 验证配置

启动应用后，当你使用 Jito Bundle 模式时，控制台会显示：

```
🌍 Using QuickNode + Lil' JIT
```

如果看到这个消息，说明配置成功！

## 降级方案

如果没有配置 QuickNode 端点，系统会自动使用 Jito 公共 API：

```
🌍 Using region: ny
```

公共 API 在低峰期可能可用，但高峰期经常会遇到速率限制。

## 成本参考

- **QuickNode Build 套餐**：约 $49/月
  - 包含 Lil' JIT 插件
  - 足够个人或小团队使用

- **更高套餐**：根据使用量选择

## 故障排查

### 仍然遇到 429 错误

1. 确认 `.env.local` 中的 `NEXT_PUBLIC_JITO_ENDPOINT` 已正确设置
2. 确认 URL 格式正确（包含 API key）
3. 确认 Lil' JIT 插件已在 QuickNode 控制面板中启用
4. 检查 QuickNode 账户余额/配额

### 控制台仍显示 "Using region: ..."

说明环境变量未生效：
1. 确认 `.env.local` 文件在项目根目录
2. 确认已重启开发服务器
3. 确认环境变量名正确：`NEXT_PUBLIC_JITO_ENDPOINT`（必须以 `NEXT_PUBLIC_` 开头）

## 技术细节

- 代码会优先使用自定义端点（QuickNode）
- 如果未配置，自动降级到公共 API 并轮换区域
- QuickNode 使用相同的 API 接口（`/api/v1/bundles`）
- 无需修改代码，只需配置环境变量

## 参考链接

- [QuickNode 官网](https://www.quicknode.com/)
- [QuickNode Jito Bundle 文档](https://www.quicknode.com/guides/solana-development/transactions/jito-bundles)
- [Jito 官方文档](https://docs.jito.wtf/)
