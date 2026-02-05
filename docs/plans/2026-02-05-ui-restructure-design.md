# UI 重构设计方案

## 背景

FlashLoanInterface.tsx（1765 行）承载了全部 UI 和业务逻辑，随着 Rebalance、高级设置、缓存提示等功能的增加，存在两个核心问题：

1. **功能层级不清**：去杠杆/加杠杆/Rebalance/仓位管理的入口和层级关系不清晰
2. **新功能硬塞**：Rebalance 等后加功能挤在已有的"杠杆操作"面板里，缺乏整体规划

## 设计目标

- 清晰的功能层级：三种操作（加杠杆、减杠杆、再平衡）各自独立
- 仓位列表化：支持多种抵押品类型的仓位，可筛选排序
- 可维护性：从单文件拆分为职责清晰的组件树

---

## 一、整体布局

保持左右分栏，但两侧职责重新划分：

```
┌─────────────────────────────────────────────────────┐
│  Hachimedes                          [连接钱包]       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │                  │  │                          │  │
│  │  仓位列表面板     │  │  [ 加杠杆 | 减杠杆 | 再平衡 ] │
│  │  · 筛选/排序     │  │  ──────────────────────  │  │
│  │  · 可展开仓位卡片 │  │                          │  │
│  │  · 手动加载入口   │  │  根据 Tab 显示对应操作面板  │  │
│  │                  │  │                          │  │
│  └──────────────────┘  └──────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 二、左侧 — 仓位列表面板

### 2.1 筛选器

顶部筛选控件：

- **抵押品筛选**：下拉列出所有抵押品类型（JLP、SOL、LBTC 等），选中后只显示该抵押品的仓位。默认"全部"。
- **债务筛选**：下拉列出所有债务类型（USDS、USDC、USDG 等）。默认"全部"。
- **排序**：健康度（LTV 高→低 / 低→高）、抵押品数量、债务数量。默认按健康度降序（最危险的排最前面）。

### 2.2 仓位卡片

每个仓位显示为一个卡片，有紧凑和展开两种状态：

**紧凑状态**（未选中）：
- 一行：Vault 名称 + ID，LTV 色块，抵押品/债务摘要

**展开状态**（选中）：
- LTV 进度条（含清算线标记）
- 抵押品详情 + [管理抵押品] 按钮
- 债务详情 + [管理债务] 按钮

点击仓位卡片即选中，右侧操作面板随之更新上下文。

### 2.3 手动加载

底部保留 Position ID 手动输入 + Vault 选择器 + 加载按钮，作为低频操作入口。

## 三、右侧 — 三 Tab 操作面板

顶部三个 Tab：**加杠杆** | **减杠杆** | **再平衡**

### 3.1 加杠杆 Tab

- 顶部显示"当前操作仓位"摘要（Vault 名 + Position ID）
- Flash Borrow 数量输入（债务币种）+ MAX 按钮
- 滑块（0 到最大可借额度）
- 预览卡片：LTV / 抵押品 / 债务的变化（当前 → 预测）
- 执行按钮（青色 cyan）
- 底部：高级设置（默认收起，摘要显示当前滑点）

### 3.2 减杠杆 Tab

- 结构与加杠杆相似
- Flash Borrow 数量输入（抵押品币种）
- 预览卡片：LTV / 抵押品 / 债务的变化
- 执行按钮（紫色 purple）
- 底部：高级设置

### 3.3 再平衡 Tab

- 源仓位：左侧选中的仓位（自动填充）
- 目标池选择器：只列出同抵押品且有仓位的其他池
- 转移数量输入（抵押品币种）
- 双向预览：源池 LTV 变化 + 目标池 LTV 变化
- 缓存年龄提醒（如仓位数据较旧）
- 执行按钮（绿色 emerald）
- 无高级设置（rebalance 不经过 swap）

### 3.4 高级设置（加杠杆/减杠杆共用）

Popover 内容：
- 滑点容忍度（预设 + 自定义）
- Mode（Flash Loan / Jito Bundle）
- 优先费用（默认/快速/极速）
- 路由类型（智能路由 / 直接路由）
- DEX 限制（Orca / Raydium / Whirlpool / Meteora）
- 最大账户数（32/28/24/20）

## 四、组件拆分架构

```
components/
├── FlashLoanInterface.tsx       # 瘦壳：布局容器 + 状态协调 (~150行)
│
├── position/                    # 仓位相关
│   ├── PositionList.tsx         # 仓位列表 + 筛选排序 (~200行)
│   ├── PositionCard.tsx         # 单个仓位卡片（紧凑/展开） (~120行)
│   ├── PositionFilters.tsx      # 筛选/排序控件 (~80行)
│   └── PositionManageDialog.tsx # 管理弹窗（已有，保持）
│
├── operations/                  # 操作面板
│   ├── OperationTabs.tsx        # 三 Tab 容器 (~60行)
│   ├── LeveragePanel.tsx        # 加杠杆面板 (~200行)
│   ├── DeleveragePanel.tsx      # 减杠杆面板 (~200行)
│   ├── RebalancePanel.tsx       # 再平衡面板 (~250行)
│   └── AdvancedSettings.tsx     # 高级设置 Popover (~150行)
│
├── common/                      # 共享子组件
│   ├── LtvProgressBar.tsx       # LTV 进度条 (~50行)
│   ├── AmountInput.tsx          # 金额输入 + 滑块 (~80行)
│   └── PreviewCard.tsx          # 操作预览卡片 (~60行)
│
├── WalletProvider.tsx           # 保持不变
├── WalletButton.tsx             # 保持不变
└── ui/                          # shadcn/ui 保持不变
```

### 4.1 状态管理

- **FlashLoanInterface.tsx**（顶层容器）持有共享状态：
  - 已发现的 vault 列表 (`discoveredVaults`)
  - 所有仓位数据 (`allPositions`)
  - 当前选中仓位 (`selectedPosition`)
  - 钱包连接状态
- **操作面板组件**通过 props 接收选中仓位，内部管理自己的表单状态（金额、高级设置等）
- **仓位列表**通过回调 `onSelectPosition` 通知选中变化

### 4.2 拆分原则

- 加杠杆和减杠杆保持为独立组件（不通过 mode 参数切换），因为业务逻辑差异（借入币种、计算方式、安全阈值）足以让独立组件更清晰
- 共享的 UI 元素（LTV 进度条、金额输入+滑块、预览卡片）抽到 `common/` 避免重复
- `lib/` 下的业务逻辑文件不做变动，只调整组件层的导入方式

## 五、迁移策略

1. 先创建 `common/` 下的共享组件（LtvProgressBar、AmountInput、PreviewCard）
2. 创建 `position/` 下的仓位组件（PositionCard、PositionFilters、PositionList）
3. 创建 `operations/` 下的操作面板组件（AdvancedSettings、LeveragePanel、DeleveragePanel、RebalancePanel、OperationTabs）
4. 重写 FlashLoanInterface.tsx 为瘦壳容器，组装上述组件
5. 验证所有操作流程正常

## 六、不变的部分

- 欢迎页面（未连接钱包时）保持不变
- Header（Logo + 钱包按钮）保持不变
- PositionManageDialog 保持不变（已是独立组件）
- `lib/` 下所有业务逻辑保持不变
- `app/` 下路由结构保持不变
- shadcn/ui 组件保持不变
