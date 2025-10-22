# 新增 Vaults 配置

## 添加的 Vaults

### 1. Vault 8: JLP/USDC
- **Vault ID**: 8
- **名称**: JLP/USDC
- **抵押品**: JLP (Jupiter Perps LP)
- **债务代币**: USDC (USD Coin)
- **Max LTV**: 82%
- **清算 LTV**: 88%
- **Vault 地址**: `7xL193GD5oUvhKBruYuNofMexMUztzujdzxw5UhaWL1U`

### 2. Vault 10: JLP/USDG
- **Vault ID**: 10
- **名称**: JLP/USDG
- **抵押品**: JLP (Jupiter Perps LP)
- **债务代币**: USDG (USDG Stablecoin)
- **Max LTV**: 82%
- **清算 LTV**: 88%
- **Vault 地址**: `C6uU7KDu6iQajELeNTJYVnt15TzNaQ29KovvBPe2sKnR`

### 3. Vault 34: JLP/USDS (已存在)
- **Vault ID**: 34
- **名称**: JLP/USDS
- **抵押品**: JLP (Jupiter Perps LP)
- **债务代币**: USDS (USDS Stablecoin)
- **Max LTV**: 82%
- **清算 LTV**: 88%
- **Vault 地址**: `2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw`

## 新增代币

### USDG
- **Symbol**: USDG
- **Name**: USDG Stablecoin
- **Mint Address**: `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH`
- **Decimals**: 6

## 如何发现的

### Vault 发现方法
1. 使用 `borrowPda.getVaultState()` 和 `borrowPda.getVaultConfig()` 枚举 vault IDs
2. 检查 vault config account 是否存在
3. 分析 config data 查找 token mint addresses

### USDG Mint 发现方法
1. 对比 Vault 8 (JLP/USDC) 的 config data，找到 JLP 和 USDC 的偏移量
2. 使用相同的偏移量在 Vault 10 的 config data 中提取 mint addresses
3. 验证 collateral mint 是 JLP，debt mint 就是 USDG

## 测试脚本

- `test-list-vaults.js` - 列出所有可用 vaults
- `test-find-jlp-vaults.js` - 查找包含 JLP 的 vaults
- `test-vault10-detail.js` - 分析 Vault 10 详细信息
- `test-compare-vaults.js` - 对比 Vault 8 和 Vault 10 找出 USDG mint

## 修改的文件

1. **lib/constants.ts**
   - 添加 USDG token 配置

2. **lib/vaults.ts**
   - 添加 Vault 8 (JLP/USDC)
   - 添加 Vault 10 (JLP/USDG)

## 使用方法

用户现在可以在 UI 的 Vault 选择器中看到 3 个 vaults：
- JLP/USDC
- JLP/USDG
- JLP/USDS (默认)

每个 vault 都支持：
- 手动输入 Position ID
- 自动查找 Position (通过 NFT)
- Leverage + Swap (加杠杆)
- Deleverage + Swap (去杠杆)
