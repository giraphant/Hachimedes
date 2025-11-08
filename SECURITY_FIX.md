# 🔒 安全修复：移除硬编码的 API Keys

## 问题描述

在代码审查中发现了硬编码的 Helius RPC API keys，这些密钥已经暴露在 Git 仓库中。任何能访问代码的人都可以看到和滥用这些 API keys。

### 受影响的文件

**生产代码：**
- `components/WalletProvider.tsx` - 硬编码的默认 API key

**测试文件（12个文件）：**
- `tests/test-oracle-parse.js`
- `tests/test-oracle-detailed.js`
- `tests/test-position-lib.js`
- `tests/test-getposition.js`
- `tests/test-vault-anchor.js`
- `tests/test-vault-manual.js`
- `tests/test-vault-price.js`
- `tests/test-position-state.js`
- `tests/test-quick-ranges.js`
- `tests/test-safe-ranges.js`
- `tests/test-why-no-init.js`
- `tests/check-jlp-decimals.js`

### 泄漏的 API Keys

以下 API keys 已经暴露：
- `e9778ccb-1f5a-4f92-bacc-9e6e5e3da45f` (生产代码中的 fallback)
- `3f46e620-a242-429f-9da9-07ca0df4030e` (测试文件中)

## 修复内容

### 1. 移除硬编码的 API Keys

所有硬编码的 API keys 已被替换为：
```javascript
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
```

**生产代码修复：**
```javascript
// 修改前
const endpoint = useMemo(
  () => process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=e9778ccb-1f5a-4f92-bacc-9e6e5e3da45f',
  []
);

// 修改后
const endpoint = useMemo(
  () => process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
  []
);
```

### 2. 使用环境变量

现在所有 RPC 端点都通过环境变量配置：

**前端（Next.js）：**
```bash
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_NEW_API_KEY
```

**测试脚本：**
```bash
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_NEW_API_KEY node tests/test-xxx.js
```

## ⚠️ 需要立即采取的行动

### 1. 撤销已泄漏的 API Keys

已泄漏的 API keys 需要**立即撤销**并重新生成：

1. 登录 [Helius Dashboard](https://dev.helius.xyz/)
2. 找到以下 API keys 并删除：
   - `e9778ccb-1f5a-4f92-bacc-9e6e5e3da45f`
   - `3f46e620-a242-429f-9da9-07ca0df4030e`
3. 生成新的 API key
4. 更新本地 `.env.local` 文件

### 2. 配置环境变量

创建或更新 `.env.local` 文件：

```bash
# 复制示例文件
cp .env.local.example .env.local

# 编辑并添加你的新 API key
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_NEW_API_KEY
NEXT_PUBLIC_NETWORK=mainnet-beta
```

### 3. 测试环境配置

运行测试时设置环境变量：

```bash
# 方式 1: 使用 .env 文件（推荐）
echo "RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" > .env
node -r dotenv/config tests/test-xxx.js

# 方式 2: 直接在命令行设置
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY node tests/test-xxx.js
```

## 最佳安全实践

### ✅ 应该做的

1. **始终使用环境变量** 存储敏感信息（API keys, 私钥, secrets）
2. **验证 .gitignore** 包含所有敏感文件：
   ```
   .env
   .env.local
   .env.*.local
   *.key
   *.pem
   ```
3. **定期轮换** API keys 和密钥
4. **使用不同的 keys** 用于开发、测试和生产环境
5. **限制 API key 权限** - 只授予必要的权限
6. **监控 API 使用情况** - 检测异常活动

### ❌ 不应该做的

1. **不要硬编码** API keys、secrets、私钥
2. **不要提交** `.env` 文件到 Git
3. **不要在代码注释中** 包含敏感信息
4. **不要共享** 生产环境的 API keys
5. **不要在公开仓库** 使用真实的 API keys（即使在示例中）

## 验证修复

运行以下命令确认没有遗漏的硬编码 keys：

```bash
# 搜索可能的 API keys
grep -r "api-key=" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git

# 应该只显示文档中的示例（包含 YOUR_API_KEY 等占位符）
```

## 其他建议

### 使用 git-secrets

安装 [git-secrets](https://github.com/awslabs/git-secrets) 防止意外提交敏感信息：

```bash
# 安装 git-secrets
brew install git-secrets  # macOS
# 或从源码安装

# 在仓库中启用
git secrets --install
git secrets --register-aws  # 添加 AWS patterns
git secrets --add 'api-key=[A-Za-z0-9-]+'  # 添加自定义 pattern
```

### 使用环境变量管理工具

考虑使用：
- [dotenv](https://www.npmjs.com/package/dotenv) - Node.js 环境变量管理
- [direnv](https://direnv.net/) - 自动加载目录环境变量
- [1Password](https://1password.com/) / [Bitwarden](https://bitwarden.com/) - 密钥管理器

## 参考资源

- [Helius API Documentation](https://docs.helius.dev/)
- [OWASP Top 10 - Sensitive Data Exposure](https://owasp.org/www-project-top-ten/)
- [GitHub - Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

---

**修复日期**: 2025-11-08
**修复者**: Claude Code Assistant
