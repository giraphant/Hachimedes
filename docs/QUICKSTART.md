# 快速启动指南

## 1. 启动开发服务器

```bash
npm run dev
```

访问: **http://localhost:28848**

## 2. 配置 RPC（可选）

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
```

推荐使用更快的 RPC（免费）:
- Helius: https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
- 获取免费 API key: https://helius.dev/

## 3. 使用步骤

1. **连接钱包**: 点击右上角 "Select Wallet"
2. **选择代币**:
   - 存款: 选择 USDC、USDT、SOL 或 JUP
   - 借款: 选择要借出的代币
3. **输入数量**:
   - USDC/USDT/JUP: 直接输入数字（如 100）
   - SOL: 直接输入数字（如 1）
4. **执行**: 点击 "执行闪电贷" 并在钱包确认

## 示例交易

### 存入 100 USDC，借出 0.5 SOL
- 存款代币: USDC
- 存款数量: 100
- 借款代币: SOL
- 借款数量: 0.5

### 存入 2 SOL，借出 150 USDC
- 存款代币: SOL
- 存款数量: 2
- 借款代币: USDC
- 借款数量: 150

## 注意事项

⚠️ 确保:
1. 钱包有足够的代币余额
2. 钱包有 ~0.01 SOL（交易费用）
3. 借款不超过抵押价值的 80%

## 故障排查

### 钱包连接失败
```bash
# 确保安装了 Phantom 或 Solflare 钱包
# 刷新页面重试
```

### 交易失败
- 检查余额是否足够
- 降低借款数量
- 使用更快的 RPC

## 端口已占用？

编辑 `package.json`:
```json
{
  "scripts": {
    "dev": "next dev -p 3000"  // 改为其他端口
  }
}
```

## 生产部署

```bash
npm run build
npm start
```

服务将在 **http://localhost:28848** 运行
