'use client';

import { useState, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletButton } from '@/components/WalletButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { TOKENS } from '@/lib/constants';
import { getVaultConfig, getAvailableVaults, setDiscoveredVaults, DEFAULT_VAULT_ID } from '@/lib/vaults';
import { discoverAllVaults, onVaultsRefreshed, DiscoveredVault } from '@/lib/vault-discovery';
import { fetchPositionInfo, PositionInfo } from '@/lib/position';
import { Loader2, TrendingUp, TrendingDown, Zap, ArrowRightLeft, RefreshCw, Info, Settings, SlidersHorizontal } from 'lucide-react';
import { PositionManageDialog } from './PositionManageDialog';
import { Slider } from '@/components/ui/slider';
import { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export function FlashLoanInterface() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  // Position 管理
  const [positionIdInput, setPositionIdInput] = useState('335'); // 默认 position ID
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(335);
  const [userPositions, setUserPositions] = useState<number[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);

  // Vault 配置
  const [vaultId, setVaultId] = useState(DEFAULT_VAULT_ID);
  const vaultConfig = getVaultConfig(vaultId);

  // Vault discovery
  const [discoveredVaults, setDiscoveredVaultsState] = useState<DiscoveredVault[]>([]);
  const [isDiscoveringVaults, setIsDiscoveringVaults] = useState(false);

  // 操作类型
  const [operationType, setOperationType] = useState<'deleverageSwap' | 'leverageSwap' | 'rebalance'>('deleverageSwap');

  // Rebalance state
  const [rebalanceSourceVaultId, setRebalanceSourceVaultId] = useState<number | null>(null);
  const [rebalanceTargetVaultId, setRebalanceTargetVaultId] = useState<number | null>(null);
  const [rebalanceAmount, setRebalanceAmount] = useState('');
  const [allPositions, setAllPositions] = useState<Record<number, PositionInfo | null>>({});
  const [isLoadingAllPositions, setIsLoadingAllPositions] = useState(false);

  // 代币自动跟随 Vault 配置
  const depositToken = vaultConfig.collateralToken;
  const borrowToken = vaultConfig.debtToken;

  // 金额和加载状态
  const [depositAmount, setDepositAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 仓位信息
  const [positionInfo, setPositionInfo] = useState<PositionInfo | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(false);

  // 管理 Dialog
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [manageDialogType, setManageDialogType] = useState<'collateral' | 'debt'>('collateral');

  // 钱包余额
  const [walletBalances, setWalletBalances] = useState<{
    collateral: number;
    debt: number;
  }>({ collateral: 0, debt: 0 });

  // 高级设置
  const [slippageBps, setSlippageBps] = useState(5); // 默认 0.05% (5 basis points，与 Jupiter 官方一致)
  const [priorityFee, setPriorityFee] = useState<'default' | 'fast' | 'turbo'>('default');
  const [selectedDexes, setSelectedDexes] = useState<string[]>([]); // 选中的 DEX 列表，空数组表示自动选择
  const [onlyDirectRoutes, setOnlyDirectRoutes] = useState(false); // 是否仅使用直接路由
  const [useJitoBundle, setUseJitoBundle] = useState(false); // 是否使用 Jito Bundle
  const [maxAccounts, setMaxAccounts] = useState(32); // Jupiter maxAccounts 限制，默认 32

  // Position 缓存辅助函数
  const getPositionCacheKey = (walletAddress: string, vaultId: number) => {
    return `hachimedes_position_${walletAddress}_vault_${vaultId}`;
  };

  const getCachedPositionId = (walletAddress: string, vaultId: number): number | null => {
    try {
      const key = getPositionCacheKey(walletAddress, vaultId);
      const cached = localStorage.getItem(key);
      return cached ? parseInt(cached, 10) : null;
    } catch (error) {
      console.error('Error reading position cache:', error);
      return null;
    }
  };

  const setCachedPositionId = (walletAddress: string, vaultId: number, positionId: number) => {
    try {
      const key = getPositionCacheKey(walletAddress, vaultId);
      localStorage.setItem(key, positionId.toString());
    } catch (error) {
      console.error('Error saving position cache:', error);
    }
  };

  // 计算预览值
  const previewData = useMemo(() => {
    if (!positionInfo || !depositAmount || isNaN(parseFloat(depositAmount)) || positionInfo.ltv === undefined) {
      return null;
    }

    const amount = parseFloat(depositAmount);
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;

    // 从当前 LTV 反推价格
    // 防止除零：检查 collateral 和 ltv 不为 0
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) {
      return null;
    }
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    let newCollateral, newDebt, newLtv;

    if (operationType === 'leverageSwap') {
      // 加杠杆：借 X USDS，swap 成 JLP
      newCollateral = currentCollateral + (amount / currentPrice);
      newDebt = currentDebt + amount;
    } else {
      // 去杠杆：借 X JLP，swap 成 USDS
      newCollateral = currentCollateral - amount;
      newDebt = currentDebt - (amount * currentPrice);
    }

    newLtv = (newDebt / (newCollateral * currentPrice)) * 100;

    return {
      newCollateral,
      newDebt,
      newLtv,
      exceedsMax: operationType === 'leverageSwap' ? newLtv > 78 : newLtv > vaultConfig.maxLtv
    };
  }, [positionInfo, depositAmount, operationType, vaultConfig.maxLtv]);

  // 获取钱包余额
  const loadWalletBalances = async () => {
    if (!publicKey) return;

    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getAccount, getAssociatedTokenAddressSync } = await import('@solana/spl-token');

      const collateralAta = getAssociatedTokenAddressSync(
        new PublicKey(vaultConfig.collateralMint),
        publicKey
      );
      const debtAta = getAssociatedTokenAddressSync(
        new PublicKey(vaultConfig.debtMint),
        publicKey
      );

      const [collateralAccount, debtAccount] = await Promise.all([
        getAccount(connection, collateralAta).catch(() => null),
        getAccount(connection, debtAta).catch(() => null),
      ]);

      setWalletBalances({
        collateral: collateralAccount
          ? Number(collateralAccount.amount) / Math.pow(10, vaultConfig.collateralDecimals)
          : 0,
        debt: debtAccount
          ? Number(debtAccount.amount) / Math.pow(10, vaultConfig.debtDecimals)
          : 0,
      });
    } catch (error) {
      console.error('Error loading wallet balances:', error);
    }
  };

  // 自动查找用户的 positions (通过 NFT)
  const findPositions = async () => {
    if (!publicKey) return;

    setIsLoadingPositions(true);
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      // 支持最大 10 万个 position IDs，分批搜索
      const positions = await findUserPositionsByNFT(connection, vaultId, publicKey, 100000);

      setUserPositions(positions);

      if (positions.length > 0) {
        // 自动选择第一个 position
        const firstPosition = positions[0];
        setSelectedPositionId(firstPosition);
        setPositionIdInput(firstPosition.toString());

        // 保存到缓存
        setCachedPositionId(publicKey.toString(), vaultId, firstPosition);

        toast({
          title: '找到 Positions',
          description: `找到 ${positions.length} 个 position(s)`,
        });
      } else {
        toast({
          title: '未找到 Position',
          description: '请前往 JUP LEND 创建一个 position',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Failed to find positions:', error);
      toast({
        title: '查找 Position 失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPositions(false);
    }
  };

  // 加载 Position - 从输入的 ID 加载仓位信息
  const loadPosition = () => {
    const posId = parseInt(positionIdInput);
    if (isNaN(posId) || posId < 0) {
      toast({
        title: '无效的 Position ID',
        description: '请输入有效的数字',
        variant: 'destructive',
      });
      return;
    }
    setSelectedPositionId(posId);
  };

  // 获取仓位信息
  const loadPositionInfo = async () => {
    if (!publicKey || selectedPositionId === null) return;

    setIsLoadingPosition(true);
    try {
      const [info] = await Promise.all([
        fetchPositionInfo(connection, vaultId, selectedPositionId, publicKey),
        loadWalletBalances(),
      ]);
      setPositionInfo(info);
    } catch (error) {
      console.error('Failed to load position info:', error);
    } finally {
      setIsLoadingPosition(false);
    }
  };

  // 钱包连接或 vault 切换时尝试从缓存加载 position
  useEffect(() => {
    if (!publicKey) {
      setSelectedPositionId(null);
      setPositionInfo(null);
      return;
    }

    // 尝试从缓存读取
    const cachedPositionId = getCachedPositionId(publicKey.toString(), vaultId);
    if (cachedPositionId !== null) {
      console.log(`使用缓存的 position ID: ${cachedPositionId} (vault ${vaultId})`);
      setSelectedPositionId(cachedPositionId);
      setPositionIdInput(cachedPositionId.toString());
    }
  }, [publicKey, vaultId]);

  // selectedPositionId 变化时加载仓位信息
  useEffect(() => {
    if (selectedPositionId !== null) {
      loadPositionInfo();
    }
  }, [selectedPositionId]);

  // Discover all vaults on mount (stale-while-revalidate)
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;

    async function discover() {
      setIsDiscoveringVaults(true);
      try {
        const vaults = await discoverAllVaults(connection);
        if (!cancelled) {
          setDiscoveredVaultsState(vaults);
          setDiscoveredVaults(vaults);
        }
      } catch (e) {
        console.error('[vault-discovery] Failed:', e);
      } finally {
        if (!cancelled) setIsDiscoveringVaults(false);
      }
    }

    discover();

    // Subscribe to background refresh (when localStorage cache was used,
    // the on-chain scan runs in the background and notifies here)
    const unsub = onVaultsRefreshed((freshVaults) => {
      if (!cancelled) {
        setDiscoveredVaultsState(freshVaults);
        setDiscoveredVaults(freshVaults);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, [connection]);

  // 计算最大可用金额
  const maxAmount = (() => {
    if (!positionInfo || !positionInfo.ltv) return 0;

    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;

    // 防止除零：检查 collateral 和 ltv 不为 0
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) {
      return 0;
    }
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    if (operationType === 'leverageSwap') {
      // 加杠杆：借 X USDS -> swap 成 JLP -> 存入抵押品 -> 借 X USDS 还闪电贷
      // 约束：新LTV = (currentDebt + X) / ((currentCollateral + X/price) × price) ≤ safeLtv
      // 推导：X ≤ (safeLtv% × currentCollateral × price - currentDebt) / (1 - safeLtv%)
      // 安全起见，使用 78% 作为加杠杆的极限，而不是 maxLtv 85%
      const safeLtvRatio = 0.78;
      const numerator = safeLtvRatio * currentCollateral * currentPrice - currentDebt;
      const denominator = 1 - safeLtvRatio;
      return Math.max(0, numerator / denominator);
    } else if (operationType === 'deleverageSwap') {
      // 去杠杆：借 X JLP -> swap 成 USDS -> 还债 -> 取出 X JLP 还闪电贷
      // 约束：X ≤ min(currentCollateral, currentDebt / price)
      if (currentDebt === 0) return currentCollateral;
      return Math.min(currentCollateral, currentDebt / currentPrice);
    }

    return 0;
  })();

  const handleExecuteFlashLoan = async () => {
    if (!publicKey) {
      toast({
        title: '钱包未连接',
        description: '请先连接您的钱包',
        variant: 'destructive',
      });
      return;
    }

    if (!signTransaction) {
      toast({
        title: '钱包不支持签名',
        description: '请使用支持签名的钱包',
        variant: 'destructive',
      });
      return;
    }

    // DeleverageSwap 和 LeverageSwap 只需要一个金额
    if (!depositAmount) {
      toast({
        title: '请填写完整信息',
        description: '请输入数量',
        variant: 'destructive',
      });
      return;
    }

    // 如果使用直接路由，提前警告
    if (onlyDirectRoutes) {
      toast({
        title: '⚠️ 使用直接路由',
        description: '直接路由可能导致较高磨损，请注意检查交易详情',
        variant: 'default',
      });
    }

    setIsLoading(true);

    try {
      let transaction: any;
      let transactions: any[] = [];
      let positionId: any;
      let swapQuote: any = undefined;

      // 动态导入
      const { PublicKey } = await import('@solana/web3.js');
      const collateralMintPk = new PublicKey(vaultConfig.collateralMint);
      const debtMintPk = new PublicKey(vaultConfig.debtMint);

      if (operationType === 'deleverageSwap') {
        if (useJitoBundle) {
          toast({
            title: '正在构建 Jito Bundle (3 TX)',
            description: 'Withdraw → Swap → Repay',
          });

          const { buildDeleverageJitoBundle } = await import('@/lib/deleverage-jito-bundle');

          const result = await buildDeleverageJitoBundle({
            collateralMint: collateralMintPk,
            debtMint: debtMintPk,
            withdrawAmount: parseFloat(depositAmount),
            userPublicKey: publicKey,
            vaultId,
            positionId: selectedPositionId!,
            connection,
            slippageBps,
            preferredDexes: selectedDexes.length > 0 ? selectedDexes : undefined,
            onlyDirectRoutes,
            maxAccounts,
            debtDecimals: vaultConfig.debtDecimals,
            collateralDecimals: vaultConfig.collateralDecimals,
          });

          transactions = result.transactions;
          positionId = result.positionId;
          swapQuote = result.swapQuote;
        } else {
          toast({
            title: '正在构建 Flash Loan 交易',
            description: 'Flash Borrow → Swap → Repay → Flash Payback',
          });

          const { buildDeleverageFlashLoanSwap } = await import('@/lib/deleverage-flashloan-swap');

          const result = await buildDeleverageFlashLoanSwap({
            collateralMint: collateralMintPk,
            debtMint: debtMintPk,
            flashLoanAmount: parseFloat(depositAmount),
            userPublicKey: publicKey,
            vaultId,
            positionId: selectedPositionId!,
            connection,
            slippageBps,
            preferredDexes: selectedDexes.length > 0 ? selectedDexes : undefined,
            onlyDirectRoutes,
            maxAccounts,
            useJitoBundle: false,
            debtDecimals: vaultConfig.debtDecimals,
            collateralDecimals: vaultConfig.collateralDecimals,
          });

          transaction = result.transaction;
          positionId = result.positionId;
          swapQuote = result.swapQuote;
        }
      } else if (operationType === 'leverageSwap') {
        if (useJitoBundle) {
          toast({
            title: '正在构建 Jito Bundle (3 TX)',
            description: 'Borrow → Swap → Deposit',
          });

          const { buildLeverageJitoBundle } = await import('@/lib/leverage-jito-bundle');

          const result = await buildLeverageJitoBundle({
            collateralMint: collateralMintPk,
            debtMint: debtMintPk,
            borrowAmount: parseFloat(depositAmount),
            userPublicKey: publicKey,
            vaultId,
            positionId: selectedPositionId!,
            connection,
            slippageBps,
            preferredDexes: selectedDexes.length > 0 ? selectedDexes : undefined,
            onlyDirectRoutes,
            maxAccounts,
            debtDecimals: vaultConfig.debtDecimals,
            collateralDecimals: vaultConfig.collateralDecimals,
          });

          transactions = result.transactions;
          positionId = result.positionId;
          swapQuote = result.swapQuote;
        } else {
          toast({
            title: '正在构建 Flash Loan 交易',
            description: 'Flash Borrow → Swap → Deposit + Borrow → Flash Payback',
          });

          const { buildLeverageFlashLoanSwap } = await import('@/lib/leverage-flashloan-swap');

          const result = await buildLeverageFlashLoanSwap({
            collateralMint: collateralMintPk,
            debtMint: debtMintPk,
            flashLoanAmount: parseFloat(depositAmount),
            userPublicKey: publicKey,
            vaultId,
            positionId: selectedPositionId!,
            connection,
            slippageBps,
            preferredDexes: selectedDexes.length > 0 ? selectedDexes : undefined,
            onlyDirectRoutes,
            maxAccounts,
            useJitoBundle: false,
            debtDecimals: vaultConfig.debtDecimals,
            collateralDecimals: vaultConfig.collateralDecimals,
          });

          transaction = result.transaction;
          positionId = result.positionId;
          swapQuote = result.swapQuote;
        }
      }

      // 签名交易 - 添加价格对比和滑点提醒
      let priceWarning = '';
      if (swapQuote && positionInfo) {
        const debtScale = Math.pow(10, vaultConfig.debtDecimals);
        const collateralScale = Math.pow(10, vaultConfig.collateralDecimals);
        const inputAmount = parseInt(swapQuote.inputAmount) / (operationType === 'leverageSwap' ? debtScale : collateralScale);
        const outputAmount = parseInt(swapQuote.outputAmount) / (operationType === 'leverageSwap' ? collateralScale : debtScale);

        // 交易价格（都统一为 USDS per JLP）
        const tradePrice = operationType === 'leverageSwap'
          ? (inputAmount / outputAmount)  // USDS → JLP: USDS per JLP
          : (outputAmount / inputAmount);  // JLP → USDS: USDS per JLP

        // 使用真实的预言机价格
        if (positionInfo.oraclePrice) {
          const oraclePrice = positionInfo.oraclePrice;

          // 计算价格偏差（滑点）
          const priceDeviation = ((tradePrice - oraclePrice) / oraclePrice) * 100;
          const deviationSign = priceDeviation > 0 ? '+' : '';

          priceWarning = `\n📊 预言机价格: $${oraclePrice.toFixed(4)}\n💱 交易价格: $${tradePrice.toFixed(4)}\n📉 价格偏差: ${deviationSign}${priceDeviation.toFixed(2)}%\n⚠️ 请检查价格是否合理`;
        } else {
          // 无法获取预言机价格时，只显示交易价格
          priceWarning = `\n💱 交易价格: $${tradePrice.toFixed(4)} USDS/JLP\n⚠️ 请检查价格是否合理`;
        }
      }

      toast({
        title: '请在钱包中确认交易',
        description: useJitoBundle
          ? `需要签名 3 个交易${priceWarning}`
          : `正在等待签名...${priceWarning}`,
      });

      if (!signTransaction) {
        throw new Error('钱包不支持签名功能');
      }

      let signedTransactions: any[] = [];

      if (useJitoBundle) {
        // 签名多个交易
        for (let i = 0; i < transactions.length; i++) {
          const signed = await signTransaction(transactions[i]);
          signedTransactions.push(signed);
        }
      } else {
        // 签名单个交易
        const signedTransaction = await signTransaction(transaction);
        signedTransactions = [signedTransaction];
      }

      // 发送交易
      let signature: string;

      if (useJitoBundle) {
        // 使用 Jito Multi-TX Bundle 发送
        toast({
          title: '正在通过 Jito Bundle 发送',
          description: `发送 ${signedTransactions.length} 个交易的原子 Bundle...`,
        });

        const { sendJitoMultiTxBundle } = await import('@/lib/jito-bundle');
        const bundleId = await sendJitoMultiTxBundle(connection, signedTransactions);

        // Bundle ID 就是 signature
        signature = bundleId;
      } else {
        // 普通发送单个交易
        toast({
          title: '正在发送交易',
          description: '请稍候...',
        });

        signature = await connection.sendTransaction(signedTransactions[0], {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      }

      // 确认交易
      toast({
        title: '正在确认交易',
        description: '这可能需要几秒钟...',
      });

      await connection.confirmTransaction(signature, 'confirmed');

      const successTitle = operationType === 'deleverageSwap'
        ? 'Deleverage + Swap 执行成功！'
        : 'Leverage + Swap 执行成功！';

      toast({
        title: successTitle,
        description: (
          <div className="mt-2 space-y-1">
            {positionId && <p>Position ID: {positionId}</p>}
            {swapQuote && (
              <div>
                <p className="text-xs">输入: {(parseInt(swapQuote.inputAmount) / (operationType === 'leverageSwap' ? Math.pow(10, vaultConfig.debtDecimals) : Math.pow(10, vaultConfig.collateralDecimals))).toFixed(6)} {operationType === 'leverageSwap' ? vaultConfig.debtToken : vaultConfig.collateralToken}</p>
                <p className="text-xs">输出: {(parseInt(swapQuote.outputAmount) / (operationType === 'leverageSwap' ? Math.pow(10, vaultConfig.collateralDecimals) : Math.pow(10, vaultConfig.debtDecimals))).toFixed(6)} {operationType === 'leverageSwap' ? vaultConfig.collateralToken : vaultConfig.debtToken}</p>
                {swapQuote.priceImpactPct && (
                  <p className="text-xs">价格影响: {swapQuote.priceImpactPct}%</p>
                )}
              </div>
            )}
            <p>交易签名: {signature.slice(0, 8)}...{signature.slice(-8)}</p>
            <a
              href={`https://solscan.io/tx/${signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline text-xs"
            >
              在 Solscan 上查看
            </a>
          </div>
        ),
      });

      // 清空表单
      setDepositAmount('');

      // 刷新仓位信息
      await loadPositionInfo();
    } catch (error: any) {
      console.error('Flash loan error:', error);

      // 检查是否是交易过大错误
      const isTxTooLarge = error.message && (
        error.message.includes('Transaction exceeds maximum size') ||
        error.message.includes('Transaction too large')
      );

      if (isTxTooLarge) {
        // TX 过大，提示降低 maxAccounts
        const suggestions = [];
        if (maxAccounts > 20) suggestions.push(`降低「最大账户数」到 ${maxAccounts === 32 ? 28 : maxAccounts === 28 ? 24 : 20}`);
        if (!onlyDirectRoutes) suggestions.push('切换到「仅直接路由」');
        if (!useJitoBundle) suggestions.push('启用 Jito Bundle');

        toast({
          title: '⚠️ 交易过大（超过 1232 bytes）',
          description: `请在高级设置中尝试：${suggestions.join('、')}`,
          variant: 'destructive',
        });
      } else {
        // 其他错误，正常显示
        toast({
          title: '闪电贷执行失败',
          description: error.message || '发生未知错误',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Cache keys for all positions
  const getAllPositionsCacheKey = (walletAddress: string, collateralMint: string) =>
    `hachimedes_all_positions_${walletAddress}_${collateralMint}`;

  const getCachedAllPositions = (walletAddress: string, collateralMint: string): { positions: Record<number, { positionId: number }>; timestamp: number } | null => {
    try {
      const key = getAllPositionsCacheKey(walletAddress, collateralMint);
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      const data = JSON.parse(cached);
      // Return with timestamp so UI can show age
      return { positions: data.positions, timestamp: data.timestamp };
    } catch {
      return null;
    }
  };

  const setCachedAllPositions = (walletAddress: string, collateralMint: string, positions: Record<number, { positionId: number }>) => {
    try {
      const key = getAllPositionsCacheKey(walletAddress, collateralMint);
      localStorage.setItem(key, JSON.stringify({ positions, timestamp: Date.now() }));
    } catch {
      // ignore quota errors
    }
  };

  // State for cache age warning
  const [positionCacheAge, setPositionCacheAge] = useState<number | null>(null);

  // Load positions for all same-collateral vaults (for rebalance)
  // Uses permanent cache: returns cached data immediately, shows age warning if old
  const loadAllSameCollateralPositions = async (collateralMint: string, forceRefresh = false) => {
    if (!publicKey) return;

    const sameColVaults = discoveredVaults.filter(v => v.collateralMint === collateralMint);

    // Step 1: Try to load from cache immediately (permanent cache)
    if (!forceRefresh) {
      const cached = getCachedAllPositions(publicKey.toString(), collateralMint);
      if (cached && cached.positions && Object.keys(cached.positions).length > 0) {
        const ageMs = Date.now() - cached.timestamp;
        const ageHours = ageMs / (1000 * 60 * 60);
        console.log(`[rebalance] Loading cached position IDs (age: ${ageHours.toFixed(1)}h)`);
        setPositionCacheAge(ageMs);

        // Load position info for cached position IDs
        const results: Record<number, PositionInfo | null> = {};
        const loadPromises = Object.entries(cached.positions).map(async ([vid, data]) => {
          const vaultId = parseInt(vid);
          try {
            const info = await fetchPositionInfo(connection, vaultId, data.positionId, publicKey);
            if (info) results[vaultId] = info;
          } catch {
            // skip failed
          }
        });
        await Promise.all(loadPromises);
        setAllPositions(results);
        setIsLoadingAllPositions(false);
        return;
      }
    }

    // Clear cache age when doing fresh scan
    setPositionCacheAge(null);

    // Step 2: Full scan
    setIsLoadingAllPositions(true);
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      const results: Record<number, PositionInfo | null> = {};
      const positionIdsCache: Record<number, { positionId: number }> = {};

      for (const vault of sameColVaults) {
        try {
          const positions = await findUserPositionsByNFT(connection, vault.id, publicKey, 100000);
          if (positions.length > 0) {
            const info = await fetchPositionInfo(connection, vault.id, positions[0], publicKey);
            results[vault.id] = info;
            positionIdsCache[vault.id] = { positionId: positions[0] };
          }
        } catch {
          // skip failed vaults
        }
      }

      setAllPositions(results);
      // Cache the position IDs (not the full info, just IDs)
      if (Object.keys(positionIdsCache).length > 0) {
        setCachedAllPositions(publicKey.toString(), collateralMint, positionIdsCache);
      }
    } catch (e) {
      console.error('Failed to load positions:', e);
    } finally {
      setIsLoadingAllPositions(false);
    }
  };

  // Background refresh for all positions
  const refreshAllPositionsInBackground = async (collateralMint: string, sameColVaults: typeof discoveredVaults) => {
    if (!publicKey) return;
    try {
      const { findUserPositionsByNFT } = await import('@/lib/find-positions-nft');
      const results: Record<number, PositionInfo | null> = {};
      const positionIdsCache: Record<number, { positionId: number }> = {};

      for (const vault of sameColVaults) {
        try {
          const positions = await findUserPositionsByNFT(connection, vault.id, publicKey, 100000);
          if (positions.length > 0) {
            const info = await fetchPositionInfo(connection, vault.id, positions[0], publicKey);
            results[vault.id] = info;
            positionIdsCache[vault.id] = { positionId: positions[0] };
          }
        } catch {
          // skip
        }
      }

      // Update state and cache
      setAllPositions(results);
      if (Object.keys(positionIdsCache).length > 0) {
        setCachedAllPositions(publicKey.toString(), collateralMint, positionIdsCache);
      }
      console.log('[rebalance] Background refresh complete');
    } catch {
      // silent fail for background refresh
    }
  };

  // When switching to rebalance tab, load all same-collateral positions
  useEffect(() => {
    if (operationType === 'rebalance' && publicKey && discoveredVaults.length > 0) {
      loadAllSameCollateralPositions(vaultConfig.collateralMint);
    }
  }, [operationType, publicKey, vaultId, discoveredVaults.length]);

  // Rebalance preview - calculate LTV correctly using debt prices
  const rebalancePreview = useMemo(() => {
    if (!rebalanceSourceVaultId || !rebalanceTargetVaultId || !rebalanceAmount) return null;
    const amount = parseFloat(rebalanceAmount);
    if (isNaN(amount) || amount <= 0) return null;

    const sourcePos = allPositions[rebalanceSourceVaultId];
    const targetPos = allPositions[rebalanceTargetVaultId];
    if (!sourcePos || !targetPos) return null;

    const sourceColPrice = sourcePos.oraclePrice ?? 0;
    const targetColPrice = targetPos.oraclePrice ?? 0;
    if (!sourceColPrice || !targetColPrice) return null;

    // For debt price: use the value from position (which was computed correctly)
    // If position has debt but no debtPrice, we can't compute preview
    const sourceDebtPrice = sourcePos.debtPrice;
    const targetDebtPrice = targetPos.debtPrice;
    if (sourcePos.debtAmountUi > 0 && !sourceDebtPrice) {
      console.warn('[rebalancePreview] Missing source debt price');
      return null;
    }
    if (targetPos.debtAmountUi > 0 && !targetDebtPrice) {
      console.warn('[rebalancePreview] Missing target debt price');
      return null;
    }

    const sourceNewCol = sourcePos.collateralAmountUi - amount;
    const targetNewCol = targetPos.collateralAmountUi + amount;

    // LTV = (debt × debtPrice) / (collateral × colPrice) × 100
    const sourceLtv = sourceNewCol > 0 && sourcePos.debtAmountUi > 0 && sourceDebtPrice
      ? ((sourcePos.debtAmountUi * sourceDebtPrice) / (sourceNewCol * sourceColPrice)) * 100
      : sourceNewCol <= 0 ? Infinity : 0;
    const targetLtv = targetNewCol > 0 && targetPos.debtAmountUi > 0 && targetDebtPrice
      ? ((targetPos.debtAmountUi * targetDebtPrice) / (targetNewCol * targetColPrice)) * 100
      : 0;

    return { sourceLtv, targetLtv, sourceNewCol, targetNewCol };
  }, [allPositions, rebalanceSourceVaultId, rebalanceTargetVaultId, rebalanceAmount]);

  // Rebalance handler
  const handleRebalance = async () => {
    if (!publicKey || !signTransaction || !rebalanceSourceVaultId || !rebalanceTargetVaultId) return;

    setIsLoading(true);
    try {
      const amount = parseFloat(rebalanceAmount);
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');

      const sourcePos = allPositions[rebalanceSourceVaultId];
      const targetPos = allPositions[rebalanceTargetVaultId];
      if (!sourcePos || !targetPos) throw new Error('Position not found');

      const sourceConfig = getVaultConfig(rebalanceSourceVaultId);

      // Pre-check: Verify source LTV won't exceed max after withdrawal
      if (sourcePos.oraclePrice && sourcePos.debtPrice && sourcePos.debtAmountUi > 0) {
        const newCollateral = sourcePos.collateralAmountUi - amount;
        if (newCollateral <= 0) {
          throw new Error(`Cannot withdraw ${amount}: exceeds available collateral (${sourcePos.collateralAmountUi.toFixed(4)})`);
        }
        const debtValueUsd = sourcePos.debtAmountUi * sourcePos.debtPrice;
        const newCollateralValueUsd = newCollateral * sourcePos.oraclePrice;
        const newLtv = (debtValueUsd / newCollateralValueUsd) * 100;
        if (newLtv > sourceConfig.maxLtv) {
          throw new Error(`Withdrawal would push source LTV to ${newLtv.toFixed(1)}%, exceeding max ${sourceConfig.maxLtv}%`);
        }
        console.log(`Pre-check: source LTV after withdrawal = ${newLtv.toFixed(2)}% (max: ${sourceConfig.maxLtv}%)`);
      }

      const { buildRebalanceTransaction } = await import('@/lib/rebalance');
      const { sendJitoMultiTxBundle } = await import('@/lib/jito-bundle');

      const result = await buildRebalanceTransaction({
        sourceVaultId: rebalanceSourceVaultId,
        sourcePositionId: sourcePos.positionId,
        targetVaultId: rebalanceTargetVaultId,
        targetPositionId: targetPos.positionId,
        collateralAmount: amount,
        collateralDecimals: sourceConfig.collateralDecimals,
        userPublicKey: publicKey,
        connection,
      });

      if (result.mode === 'single') {
        // Single atomic transaction (withdraw + deposit in one TX)
        toast({ title: '请在钱包中确认交易（原子操作）' });
        const signed = await signTransaction(result.transactions[0]);
        const sig = await connection.sendTransaction(signed, { skipPreflight: false, preflightCommitment: 'confirmed' });
        await connection.confirmTransaction(sig, 'confirmed');
        toast({ title: 'Rebalance 成功！', description: `单笔原子交易: ${sig.slice(0, 8)}...` });
      } else {
        // Jito bundle (2 TXs when single TX is too large)
        toast({ title: '请签名 2 个交易（Jito Bundle）' });
        const signed = [];
        for (const tx of result.transactions) {
          signed.push(await signTransaction(tx));
        }
        const bundleId = await sendJitoMultiTxBundle(connection, signed);
        toast({ title: 'Rebalance Bundle 已发送', description: `Bundle: ${bundleId.slice(0, 8)}...` });
      }

      setRebalanceAmount('');
      // Reload positions
      loadAllSameCollateralPositions(vaultConfig.collateralMint);
      loadPositionInfo();
    } catch (e: any) {
      toast({ title: 'Rebalance 失败', description: e.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Available vaults for rebalance (same collateral, user has position)
  const rebalanceVaults = useMemo(() => {
    return Object.entries(allPositions)
      .filter(([, pos]) => pos !== null)
      .map(([vid, pos]) => ({ vaultId: parseInt(vid), position: pos! }));
  }, [allPositions]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-green-500" />
              <h1 className="text-2xl font-bold text-white">Hachimedes</h1>
            </div>
            <WalletButton />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {!publicKey ? (
          /* 未连接钱包 - 欢迎页面 */
          <div className="max-w-3xl mx-auto">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center space-y-6">
                <div className="flex justify-center">
                  <Zap className="h-16 w-16 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-white">
                    给我一个杠杆，我能撬动整个木星
                  </h2>
                  <p className="text-slate-400 text-lg">
                    一键闪电贷操作 · 单笔交易完成加/去杠杆 · 安全高效
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="text-3xl mb-2">⚡</div>
                    <div className="font-semibold text-white mb-1">Flash Loan</div>
                    <div className="text-xs text-slate-400">零成本借贷</div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="text-3xl mb-2">🔄</div>
                    <div className="font-semibold text-white mb-1">自动 Swap</div>
                    <div className="text-xs text-slate-400">Jupiter 聚合</div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="text-3xl mb-2">🎯</div>
                    <div className="font-semibold text-white mb-1">一键完成</div>
                    <div className="text-xs text-slate-400">原子操作</div>
                  </div>
                </div>
                <div className="pt-6">
                  <p className="text-slate-500 mb-4">请先连接钱包开始使用</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* 已连接钱包 - 左右分栏布局 */
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 左侧：仓位状态面板 */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">📊 仓位状态</CardTitle>
                  <CardDescription>当前仓位信息</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Vault 选择 + Position ID 输入 */}
                  <div className="space-y-3">
                    <Label className="text-slate-300 text-sm">选择 Vault & Position</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={vaultId.toString()} onValueChange={(val) => setVaultId(parseInt(val))}>
                        <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {isDiscoveringVaults && getAvailableVaults().length <= 3 ? (
                            <SelectItem value={vaultId.toString()} disabled>
                              <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                              Discovering vaults...
                            </SelectItem>
                          ) : (
                            getAvailableVaults().map((vault) => (
                              <SelectItem key={vault.id} value={vault.id.toString()}>
                                {vault.name} (#{vault.id})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>

                      {/* Position ID 输入 */}
                      <Input
                        type="number"
                        placeholder="Position ID"
                        value={positionIdInput}
                        onChange={(e) => setPositionIdInput(e.target.value)}
                        className="w-32 bg-slate-900/70 border-slate-700 text-sm"
                      />

                      <Button
                        onClick={loadPosition}
                        size="sm"
                        variant="outline"
                        className="text-xs"
                      >
                        加载
                      </Button>

                      <Button
                        onClick={findPositions}
                        disabled={isLoadingPositions || !publicKey}
                        size="sm"
                        variant="outline"
                        className="text-xs"
                      >
                        {isLoadingPositions ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            查找中
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1 h-3 w-3" />
                            自动查找
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isLoadingPosition ? (
                    <div className="flex items-center justify-center gap-2 text-slate-400 py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>加载仓位信息...</span>
                    </div>
                  ) : positionInfo ? (
                    <div className="space-y-6">
                      {/* Vault 信息 - 移到顶部小标签 */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-1 rounded bg-blue-950/50 text-blue-400 border border-blue-900/50">
                          {vaultConfig.name}
                        </span>
                        <span className="text-slate-500">
                          最大:{vaultConfig.maxLtv}% · 清算:{vaultConfig.liquidationLtv}%
                        </span>
                      </div>

                      {/* LTV Display - 加进度条 */}
                      {positionInfo.ltv !== undefined && (
                        <div className="space-y-3">
                          <div className="flex items-end justify-between">
                            <span className="text-sm text-slate-400">清算阈线(LTV)</span>
                            <div className="flex items-center gap-2">
                              <div className={`text-4xl font-bold ${
                                positionInfo.ltv < 70 ? 'text-green-400' :
                                positionInfo.ltv < 82 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {positionInfo.ltv.toFixed(1)}%
                              </div>
                              {previewData && (
                                <>
                                  <span className="text-2xl text-slate-600">→</span>
                                  <div className={`text-4xl font-bold ${
                                    previewData.newLtv < 70 ? 'text-green-400' :
                                    previewData.newLtv < 82 ? 'text-yellow-400' :
                                    'text-red-400'
                                  }`}>
                                    {previewData.newLtv.toFixed(1)}%
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* LTV 进度条 */}
                          <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                                positionInfo.ltv < 70 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                                positionInfo.ltv < 82 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                                'bg-gradient-to-r from-red-500 to-red-400'
                              }`}
                              style={{ width: `${Math.min(positionInfo.ltv, 100)}%` }}
                            />
                            {/* 清算线标记 */}
                            <div
                              className="absolute inset-y-0 w-0.5 bg-red-500/50"
                              style={{ left: `${vaultConfig.liquidationLtv}%` }}
                            />
                          </div>

                          {/* 区间说明 */}
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{positionInfo.ltv.toFixed(1)}%</span>
                            <span>清算:{vaultConfig.liquidationLtv}%</span>
                          </div>
                        </div>
                      )}

                      {/* 抵押品 & 债务 - 更突出 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative group">
                          <div className="text-center p-4 rounded-xl bg-slate-900/30 border-2 border-slate-700/40 hover:border-slate-600 transition-all cursor-pointer"
                               onClick={() => {
                                 setManageDialogType('collateral');
                                 setIsManageDialogOpen(true);
                               }}>
                            <div className="relative">
                              <div className="text-xs text-slate-500 mb-2 text-center">
                                抵押品
                              </div>
                              <Settings className="absolute top-0 right-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-green-400 mb-1">
                              <span>{positionInfo.collateralAmountUi.toFixed(2)}</span>
                              {previewData && (
                                <>
                                  <span className="text-slate-600">→</span>
                                  <span>{previewData.newCollateral.toFixed(2)}</span>
                                </>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{vaultConfig.collateralToken}</div>
                          </div>
                        </div>

                        <div className="relative group">
                          <div className="text-center p-4 rounded-xl bg-slate-900/30 border-2 border-slate-700/40 hover:border-slate-600 transition-all cursor-pointer"
                               onClick={() => {
                                 setManageDialogType('debt');
                                 setIsManageDialogOpen(true);
                               }}>
                            <div className="relative">
                              <div className="text-xs text-slate-500 mb-2 text-center">
                                债务
                              </div>
                              <Settings className="absolute top-0 right-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-orange-400 mb-1">
                              <span>{positionInfo.debtAmountUi.toFixed(2)}</span>
                              {previewData && (
                                <>
                                  <span className="text-slate-600">→</span>
                                  <span>{previewData.newDebt.toFixed(2)}</span>
                                </>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{vaultConfig.debtToken}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-slate-500 mb-2">未加载仓位</p>
                      <p className="text-xs text-slate-600 mb-3">
                        输入您的 Position ID 并点击"加载"按钮<br />
                        或前往{' '}
                        <a
                          href="https://lend.jup.ag"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          JUP LEND
                        </a>
                        {' '}创建新仓位
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 右侧：操作面板 */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">⚡ 杠杆操作</CardTitle>
                  <CardDescription>选择操作类型并输入金额</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
              {/* 2️⃣ Operation Type Selector - 选择要做什么 */}
              <div className="space-y-3">
                <Label className="text-slate-300 text-sm">选择操作</Label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setOperationType('deleverageSwap')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      operationType === 'deleverageSwap'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <TrendingDown className={`h-5 w-5 flex-shrink-0 ${operationType === 'deleverageSwap' ? 'text-purple-500' : 'text-slate-400'}`} />
                      <span className={`font-semibold text-sm ${operationType === 'deleverageSwap' ? 'text-purple-500' : 'text-slate-400'}`}>
                        去杠杆
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">降低 LTV</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOperationType('leverageSwap')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      operationType === 'leverageSwap'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <TrendingUp className={`h-5 w-5 flex-shrink-0 ${operationType === 'leverageSwap' ? 'text-cyan-500' : 'text-slate-400'}`} />
                      <span className={`font-semibold text-sm ${operationType === 'leverageSwap' ? 'text-cyan-500' : 'text-slate-400'}`}>
                        加杠杆
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">提高 LTV</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOperationType('rebalance')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      operationType === 'rebalance'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <ArrowRightLeft className={`h-5 w-5 flex-shrink-0 ${operationType === 'rebalance' ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span className={`font-semibold text-sm ${operationType === 'rebalance' ? 'text-emerald-500' : 'text-slate-400'}`}>
                        平衡
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">跨池平衡</p>
                  </button>
                </div>
              </div>

              {operationType === 'rebalance' ? (
              /* Rebalance Panel */
              <div className="space-y-4 p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                {/* Cache age warning */}
                {positionCacheAge && positionCacheAge > 60 * 60 * 1000 && (
                  <div className="flex items-center justify-between p-2 rounded bg-yellow-900/20 border border-yellow-700/30 text-xs">
                    <span className="text-yellow-400">
                      仓位数据缓存于 {Math.floor(positionCacheAge / (1000 * 60 * 60))} 小时前
                    </span>
                    <button
                      onClick={() => loadAllSameCollateralPositions(vaultConfig.collateralMint, true)}
                      className="text-yellow-300 hover:text-yellow-100 underline"
                    >
                      刷新
                    </button>
                  </div>
                )}

                {isLoadingAllPositions ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">正在搜索同抵押品池子的仓位...</span>
                  </div>
                ) : rebalanceVaults.length < 2 ? (
                  <div className="text-center py-4">
                    <p className="text-slate-400 text-sm">需要在至少 2 个同抵押品池子中有仓位才能 Rebalance</p>
                    <p className="text-xs text-slate-500 mt-1">找到 {rebalanceVaults.length} 个有仓位的池子（{vaultConfig.collateralToken} 抵押品）</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Source vault selector */}
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">转出池（健康的）</Label>
                      <Select
                        value={rebalanceSourceVaultId?.toString() ?? ''}
                        onValueChange={(val) => setRebalanceSourceVaultId(parseInt(val))}
                      >
                        <SelectTrigger className="bg-slate-900/70 border-slate-700 text-sm">
                          <SelectValue placeholder="选择转出池" />
                        </SelectTrigger>
                        <SelectContent>
                          {rebalanceVaults
                            .filter(v => v.vaultId !== rebalanceTargetVaultId)
                            .map(({ vaultId: vid, position: pos }) => {
                              const vc = getVaultConfig(vid);
                              return (
                                <SelectItem key={vid} value={vid.toString()}>
                                  {vc.name} (#{vid}) — LTV: {pos.ltv?.toFixed(1) ?? '?'}% — 抵押: {pos.collateralAmountUi.toFixed(2)}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Target vault selector */}
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">转入池（需要补充的）</Label>
                      <Select
                        value={rebalanceTargetVaultId?.toString() ?? ''}
                        onValueChange={(val) => setRebalanceTargetVaultId(parseInt(val))}
                      >
                        <SelectTrigger className="bg-slate-900/70 border-slate-700 text-sm">
                          <SelectValue placeholder="选择转入池" />
                        </SelectTrigger>
                        <SelectContent>
                          {rebalanceVaults
                            .filter(v => v.vaultId !== rebalanceSourceVaultId)
                            .map(({ vaultId: vid, position: pos }) => {
                              const vc = getVaultConfig(vid);
                              return (
                                <SelectItem key={vid} value={vid.toString()}>
                                  {vc.name} (#{vid}) — LTV: {pos.ltv?.toFixed(1) ?? '?'}% — 抵押: {pos.collateralAmountUi.toFixed(2)}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">转移数量 ({vaultConfig.collateralToken})</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={rebalanceAmount}
                        onChange={(e) => setRebalanceAmount(e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white"
                        step="0.01"
                      />
                    </div>

                    {/* Preview */}
                    {rebalancePreview && (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-3 rounded-lg bg-slate-900/30 border border-slate-700/40">
                          <div className="text-xs text-slate-500 mb-1">转出池 LTV</div>
                          <div className={`font-bold ${rebalancePreview.sourceLtv > 85 ? 'text-red-400' : rebalancePreview.sourceLtv > 75 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {allPositions[rebalanceSourceVaultId!]?.ltv?.toFixed(1) ?? '?'}% → {rebalancePreview.sourceLtv === Infinity ? '∞' : rebalancePreview.sourceLtv.toFixed(1)}%
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/30 border border-slate-700/40">
                          <div className="text-xs text-slate-500 mb-1">转入池 LTV</div>
                          <div className={`font-bold ${rebalancePreview.targetLtv > 85 ? 'text-red-400' : rebalancePreview.targetLtv > 75 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {allPositions[rebalanceTargetVaultId!]?.ltv?.toFixed(1) ?? '?'}% → {rebalancePreview.targetLtv.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Execute */}
                    <Button
                      onClick={handleRebalance}
                      disabled={!publicKey || isLoading || !rebalanceSourceVaultId || !rebalanceTargetVaultId || !rebalanceAmount}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          执行中...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          执行 Rebalance（跨池平衡）
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
              ) : (
              <>
              {/* 3️⃣ Amount Input - 输入金额 */}
              <div className="space-y-4 p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="depositAmount" className="text-slate-300">
                      {operationType === 'leverageSwap' ? 'Flash Borrow 数量 (USDS)' : 'Flash Borrow 数量 (JLP)'}
                    </Label>
                    <div className="text-xs text-slate-400">
                      可用: <span className="font-mono text-slate-300">{maxAmount.toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Input with MAX button */}
                  <div className="flex gap-2">
                    <Input
                      id="depositAmount"
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white flex-1"
                      step="0.000001"
                      max={maxAmount}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDepositAmount(maxAmount.toFixed(6))}
                      disabled={maxAmount === 0}
                      className="px-3"
                    >
                      MAX
                    </Button>
                  </div>

                  {/* Slider */}
                  <div className="space-y-2">
                    <Slider
                      value={[parseFloat(depositAmount) || 0]}
                      onValueChange={([value]) => {
                        // 只有在值有效时才更新，避免 NaN 问题
                        if (!isNaN(value) && isFinite(value)) {
                          setDepositAmount(value.toFixed(6));
                        }
                      }}
                      max={maxAmount > 0 ? maxAmount : 1}
                      step={maxAmount > 0 ? maxAmount / 100 : 0.01}
                      disabled={maxAmount === 0}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0</span>
                      <span>{maxAmount > 0 ? (maxAmount * 0.5).toFixed(2) : '0.00'}</span>
                      <span>{maxAmount > 0 ? maxAmount.toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* 3.5️⃣ Advanced Settings - 高级设置 */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-slate-700/40">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-300">高级设置</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs">
                      滑点: {(slippageBps / 100).toFixed(2)}%
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 bg-slate-900 border-slate-700 max-h-[85vh] overflow-y-auto">
                    <div className="space-y-3">
                      <div className="space-y-1 pb-2">
                        <h4 className="font-medium text-white flex items-center gap-2 text-sm">
                          <SlidersHorizontal className="h-4 w-4" />
                          交易设置
                        </h4>
                      </div>

                      {/* 滑点设置 */}
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">滑点容忍度</Label>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant={slippageBps === 5 ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSlippageBps(5)}
                            className="flex-1 text-xs h-8 rounded-lg"
                          >
                            0.05%
                          </Button>
                          <Button
                            type="button"
                            variant={slippageBps === 10 ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSlippageBps(10)}
                            className="flex-1 text-xs h-8 rounded-lg"
                          >
                            0.1%
                          </Button>
                          <div className="flex-1 flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 border border-slate-700">
                            <Input
                              type="number"
                              value={slippageBps / 100 || ''}
                              placeholder="0.00"
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) * 100;
                                if (!isNaN(value) && value >= 0 && value <= 5000) {
                                  setSlippageBps(Math.round(value));
                                } else if (e.target.value === '') {
                                  setSlippageBps(0);
                                }
                              }}
                              className="bg-transparent border-0 text-white text-xs text-center w-full p-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              step="0.1"
                              min="0"
                              max="50"
                            />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                        </div>
                      </div>

                      {/* Mode */}
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">Mode</Label>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant={!useJitoBundle ? "default" : "outline"}
                            size="sm"
                            onClick={() => setUseJitoBundle(false)}
                            className="flex-1 text-xs h-8"
                          >
                            Flash Loan
                          </Button>
                          <Button
                            type="button"
                            variant={useJitoBundle ? "default" : "outline"}
                            size="sm"
                            onClick={() => setUseJitoBundle(true)}
                            className="flex-1 text-xs h-8"
                          >
                            Jito Bundle
                          </Button>
                        </div>
                      </div>

                      {/* 优先费用 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-slate-300 text-xs">优先费用</Label>
                          <span className="text-xs text-slate-500">
                            {priorityFee === 'default' && '默认'}
                            {priorityFee === 'fast' && '快'}
                            {priorityFee === 'turbo' && '极速'}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant={priorityFee === 'default' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPriorityFee('default')}
                            className="flex-1 text-xs h-8"
                          >
                            默认
                          </Button>
                          <Button
                            type="button"
                            variant={priorityFee === 'fast' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPriorityFee('fast')}
                            className="flex-1 text-xs h-8"
                          >
                            快速
                          </Button>
                          <Button
                            type="button"
                            variant={priorityFee === 'turbo' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPriorityFee('turbo')}
                            className="flex-1 text-xs h-8"
                          >
                            极速
                          </Button>
                        </div>
                      </div>

                      {/* 路由类型 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-slate-300 text-xs">路由类型</Label>
                          <span className="text-xs text-slate-500">
                            {onlyDirectRoutes ? '直接' : '智能'}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant={!onlyDirectRoutes ? "default" : "outline"}
                            size="sm"
                            onClick={() => setOnlyDirectRoutes(false)}
                            className="flex-1 text-xs h-8"
                          >
                            智能路由
                          </Button>
                          <Button
                            type="button"
                            variant={onlyDirectRoutes ? "default" : "outline"}
                            size="sm"
                            onClick={() => setOnlyDirectRoutes(true)}
                            className="flex-1 text-xs h-8"
                          >
                            直接路由
                          </Button>
                        </div>
                      </div>

                      {/* DEX 限制 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-slate-300 text-xs">DEX 限制</Label>
                          <span className="text-xs text-slate-500">
                            {selectedDexes.length === 0 ? '自动' : selectedDexes.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {['Orca', 'Raydium', 'Whirlpool', 'Meteora'].map((dex) => (
                            <Button
                              key={dex}
                              type="button"
                              variant={selectedDexes.includes(dex) ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSelectedDexes(prev =>
                                  prev.includes(dex)
                                    ? prev.filter(d => d !== dex)
                                    : [...prev, dex]
                                );
                              }}
                              className="text-xs h-7"
                            >
                              {dex}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* 最大账户数 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-slate-300 text-xs">最大账户数</Label>
                          <span className="text-xs text-slate-500">{maxAccounts}</span>
                        </div>
                        <div className="flex gap-1.5">
                          {[32, 28, 24, 20].map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={maxAccounts === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setMaxAccounts(value)}
                              className="flex-1 text-xs h-8"
                            >
                              {value}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">
                          交易过大时降低此值 (32→28→24→20)
                        </p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* 4️⃣ Execute Button - 执行操作 */}
              <Button
                onClick={handleExecuteFlashLoan}
                disabled={!publicKey || isLoading}
                className={`w-full ${
                  operationType === 'deleverageSwap'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-cyan-600 hover:bg-cyan-700'
                } text-white`}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    {operationType === 'deleverageSwap'
                      ? '执行 Deleverage + Swap（一键去杠杆）'
                      : '执行 Leverage + Swap（一键加杠杆）'}
                  </>
                )}
              </Button>

              {/* Warning */}
              {publicKey && depositAmount && (
                <div className="p-3 rounded-lg bg-yellow-950/20 border border-yellow-800/50">
                  <p className="text-xs text-yellow-400 mb-1">⚠️ 注意事项:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs text-yellow-300/80">
                    <li>Flash Loan 原子操作，要么全部成功，要么全部失败</li>
                    <li>确保钱包有足够的 SOL 支付交易费（约 0.001-0.005 SOL）</li>
                    <li>交易不可逆，请仔细检查参数</li>
                  </ul>
                </div>
              )}
              </>
              )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Position Manage Dialog */}
      {positionInfo && (
        <PositionManageDialog
          open={isManageDialogOpen}
          onOpenChange={setIsManageDialogOpen}
          positionInfo={positionInfo}
          vaultId={vaultId}
          positionId={selectedPositionId!}
          initialType={manageDialogType}
          onSuccess={loadPositionInfo}
        />
      )}
    </div>
  );
}
