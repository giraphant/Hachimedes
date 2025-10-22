# 哈基米德 (Hachimedes)

中文 | [English](./README.md)

> "给我一个杠杆，我能撑起整个木星。" —— 阿基米德（改编）

基于 Solana 的 Jupiter Lend 闪电贷接口，支持一键加杠杆和去杠杆操作。

## ✨ 核心功能

- 🚀 **一键加杠杆/去杠杆**：单笔交易完成复杂的 DeFi 操作
- ⚡ **闪电贷集成**：利用 Jupiter Lend 的闪电贷功能
- 🔄 **自动兑换**：通过 Jupiter 聚合器自动兑换代币
- 🎯 **仓位管理**：轻松管理你的借贷仓位
- 🔍 **NFT 仓位发现**：自动发现你的仓位（支持 10 万个仓位 ID）
- 📊 **实时 LTV 显示**：实时监控你的贷款价值比

## 🏦 支持的资金池

- JLP/USDC (资金池 8)
- JLP/USDG (资金池 10)
- JLP/USDS (资金池 34) - 默认

## 🔧 工作原理

### 加杠杆

1. 从 Jupiter Lend 闪电借入 USDS
2. 通过 Jupiter 聚合器将 USDS → JLP
3. 存入 JLP 作为抵押品 + 借出 USDS
4. 偿还闪电贷

**一切都在单笔原子交易中完成！**

### 去杠杆

1. 从 Jupiter Lend 闪电借入 JLP
2. 通过 Jupiter 聚合器将 JLP → USDS
3. 偿还债务 + 提取 JLP 抵押品
4. 偿还闪电贷

**一切都在单笔原子交易中完成！**

## 🛠 技术栈

- **框架**: Next.js 14 + React
- **区块链**: Solana
- **钱包**: Solana Wallet Adapter
- **DeFi 协议**: Jupiter Lend SDK
- **DEX 聚合器**: Jupiter Swap API
- **UI**: Tailwind CSS + shadcn/ui
- **语言**: TypeScript

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/giraphant/Hachimedes.git
cd Hachimedes
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local` 并添加你的 RPC 端点：

```env
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
# 或使用付费 RPC 以获得更好的性能：
# NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

### 4. 启动开发服务器

```bash
npm run dev
```

### 5. 在浏览器中打开

```
http://localhost:28848
```

## 🔍 仓位发现系统

应用内置智能 NFT 仓位发现系统：

- **快速搜索**：大多数仓位在 1 秒内找到（0-1,000 范围）
- **深度搜索**：支持最多 10 万个仓位 ID
- **批量策略**：分批搜索以保持 UI 响应性
- **进度反馈**：实时加载指示器

**性能表现**：
- 3 位数仓位 ID (0-999)：~300ms
- 4 位数仓位 ID (1000-9999)：~3s
- 5 位数仓位 ID (10000-99999)：~20-30s

## 📜 可用命令

```bash
npm run dev     # 启动开发服务器（端口 28848）
npm run build   # 构建生产版本
npm run start   # 启动生产服务器（端口 28848）
npm run lint    # 运行 ESLint
```

## 📚 文档

- [NFT 仓位发现](./docs/POSITION_NFT_DISCOVERY.md)
- [仓位搜索优化](./docs/POSITION_SEARCH_OPTIMIZATION.md)
- [UX 加载修复](./docs/UX_FIX_LOADING.md)
- [新增资金池](./docs/VAULTS_ADDED.md)

## 🚨 部署说明

### Coolify 部署

1. **仓库地址**：`https://github.com/giraphant/Hachimedes`
2. **默认端口**：`28848`
3. **环境变量**：
   ```
   NEXT_PUBLIC_RPC_URL=你的RPC地址
   NEXT_PUBLIC_NETWORK=mainnet-beta
   ```
4. **构建命令**：`npm run build`
5. **启动命令**：`npm start`

### 反向代理配置

如果你使用 Nginx 或其他反向代理，请将流量转发到端口 `28848`：

```nginx
location / {
    proxy_pass http://localhost:28848;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## ⚠️ 安全提示

- ⚠️ 这是实验性软件，使用风险自负
- ⚠️ 签名前务必验证交易内容
- ⚠️ 切勿分享你的私钥或助记词
- ⚠️ 建议先用小额资金测试

## 🤝 贡献

欢迎贡献代码！请随时提交 Pull Request。

## 📄 开源协议

MIT

## 🙏 致谢

- [Jupiter](https://jup.ag/) - 提供强大的 DeFi 协议
- [Solana](https://solana.com/) - 提供高性能区块链
- [shadcn/ui](https://ui.shadcn.com/) - 提供精美的 UI 组件

---

**为 Solana DeFi 社区倾情打造**

<sub>Built with ❤️ by the community</sub>
