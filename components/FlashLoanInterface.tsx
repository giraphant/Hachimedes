'use client';

import { useState } from 'react';
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
import { getVaultConfig, getAvailableVaults, DEFAULT_VAULT_ID } from '@/lib/vaults';
import { fetchPositionInfo, PositionInfo } from '@/lib/position';
import { Loader2, TrendingUp, TrendingDown, Zap, ArrowRightLeft, RefreshCw, Info, Settings } from 'lucide-react';
import { PositionManageDialog } from './PositionManageDialog';
import { Slider } from '@/components/ui/slider';
import { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

  // 操作类型
  const [operationType, setOperationType] = useState<'deleverageSwap' | 'leverageSwap'>('deleverageSwap');

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

  // 获取钱包余额
  const loadWalletBalances = async () => {
    if (!publicKey) return;

    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getAccount, getAssociatedTokenAddressSync } = await import('@solana/spl-token');

      const collateralToken = TOKENS[vaultConfig.collateralToken];
      const debtToken = TOKENS[vaultConfig.debtToken];

      const collateralAta = getAssociatedTokenAddressSync(
        new PublicKey(collateralToken.mint),
        publicKey
      );
      const debtAta = getAssociatedTokenAddressSync(
        new PublicKey(debtToken.mint),
        publicKey
      );

      const [collateralAccount, debtAccount] = await Promise.all([
        getAccount(connection, collateralAta).catch(() => null),
        getAccount(connection, debtAta).catch(() => null),
      ]);

      setWalletBalances({
        collateral: collateralAccount
          ? Number(collateralAccount.amount) / Math.pow(10, collateralToken.decimals)
          : 0,
        debt: debtAccount
          ? Number(debtAccount.amount) / Math.pow(10, debtToken.decimals)
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
        setSelectedPositionId(positions[0]);
        setPositionIdInput(positions[0].toString());
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

  // 钱包断连时清空仓位信息
  useEffect(() => {
    if (!publicKey) {
      setSelectedPositionId(null);
      setPositionInfo(null);
    }
  }, [publicKey]);

  // selectedPositionId 变化时加载仓位信息
  useEffect(() => {
    if (selectedPositionId !== null) {
      loadPositionInfo();
    }
  }, [selectedPositionId]);

  // 计算最大可用金额
  const maxAmount = (() => {
    if (!positionInfo || !positionInfo.ltv) return 0;

    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    if (operationType === 'leverageSwap') {
      // Leverage: 最大可借 USDS = 不超过 maxLtv 的最大债务
      const maxDebt = currentCollateral * currentPrice * vaultConfig.maxLtv / 100;
      return Math.max(0, maxDebt - currentDebt);
    } else if (operationType === 'deleverageSwap') {
      // Deleverage: 最大可取 JLP = 不超过 maxLtv 的最大可取抵押品
      if (currentDebt === 0) return currentCollateral;
      const minCollateralNeeded = currentDebt / (currentPrice * vaultConfig.maxLtv / 100);
      return Math.max(0, currentCollateral - minCollateralNeeded);
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

    setIsLoading(true);

    try {
      const depositTokenInfo = TOKENS[depositToken];
      const borrowTokenInfo = TOKENS[borrowToken];

      let transaction: any;
      let positionId: any;
      let swapQuote: any = undefined;

      // 动态导入
      const { PublicKey } = await import('@solana/web3.js');

      if (operationType === 'deleverageSwap') {
        // Deleverage + Swap 模式：使用 Direct Operate（无初始化指令）
        toast({
          title: '正在构建 Flash Loan 交易',
          description: 'Flash Borrow → Swap → Repay → Flash Payback',
        });

        const { buildDeleverageFlashLoanSwap } = await import('@/lib/deleverage-flashloan-swap');

        const flashLoanAmountRaw = parseFloat(depositAmount);

        const result = await buildDeleverageFlashLoanSwap({
          collateralMint: new PublicKey(depositTokenInfo.mint), // JLP
          debtMint: new PublicKey(borrowTokenInfo.mint),        // USDS
          flashLoanAmount: flashLoanAmountRaw,
          userPublicKey: publicKey,
          vaultId: vaultId,
          positionId: selectedPositionId!,
          connection,
          slippageBps: 50,
        });

        transaction = result.transaction;
        positionId = result.positionId;
        swapQuote = result.swapQuote;
      } else if (operationType === 'leverageSwap') {
        // Leverage + Swap 模式：使用 Flash Loan
        toast({
          title: '正在构建 Flash Loan 交易',
          description: 'Flash Borrow → Swap → Deposit + Borrow → Flash Payback',
        });

        const { buildLeverageFlashLoanSwap } = await import('@/lib/leverage-flashloan-swap');

        const flashLoanAmountRaw = parseFloat(depositAmount);

        const result = await buildLeverageFlashLoanSwap({
          collateralMint: new PublicKey(depositTokenInfo.mint), // JLP (抵押品)
          debtMint: new PublicKey(borrowTokenInfo.mint),        // USDS (债务)
          flashLoanAmount: flashLoanAmountRaw,
          userPublicKey: publicKey,
          vaultId: vaultId,
          positionId: selectedPositionId!,
          connection,
          slippageBps: 50,
        });

        transaction = result.transaction;
        positionId = result.positionId;
        swapQuote = result.swapQuote;
      }

      // 签名交易（versioned transaction）
      toast({
        title: '请在钱包中确认交易',
        description: '正在等待签名...',
      });

      // 使用 signTransaction 签名 versioned transaction
      if (!signTransaction) {
        throw new Error('钱包不支持签名功能');
      }

      const signedTransaction = await signTransaction(transaction);

      // 发送交易
      toast({
        title: '正在发送交易',
        description: '请稍候...',
      });

      // 发送 versioned transaction
      const signature = await connection.sendTransaction(signedTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

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
                <p className="text-xs">输入: {(parseInt(swapQuote.inputAmount) / 1e6).toFixed(6)} {depositToken}</p>
                <p className="text-xs">输出: {(parseInt(swapQuote.outputAmount) / 1e6).toFixed(6)} {borrowToken}</p>
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
      toast({
        title: '闪电贷执行失败',
        description: error.message || '发生未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Flash Loan Card */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                Flash Loan 闪电贷操作
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-slate-400 hover:text-slate-300 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm bg-slate-900 border-slate-700 p-4" side="bottom">
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="font-semibold text-blue-400 mb-1">Vault {vaultId}: {vaultConfig.name}</p>
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">Leverage</p>
                          <p className="text-slate-400 text-xs">在单个交易中同时存入 JLP 抵押品并借出 USDS，最大化资金效率。</p>
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">Deleverage</p>
                          <p className="text-slate-400 text-xs">在单个交易中同时还款 USDS 并取出 JLP 抵押品，降低杠杆倍数。</p>
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">Swap</p>
                          <p className="text-slate-400 text-xs">通过 Jupiter Swap 交换代币，自动寻找最佳路由和价格。</p>
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">Deleverage + Swap</p>
                          <p className="text-slate-400 text-xs">一键去杠杆 - 取出抵押品 → 自动 Swap → 还款，三合一原子操作。</p>
                        </div>
                        <div className="pt-2 border-t border-slate-700">
                          <p className="text-xs text-yellow-400">⚠️ 请确保钱包有足够的代币余额和 SOL 支付交易费</p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>
                {operationType === 'deleverageSwap'
                  ? '去杠杆：Flash Borrow JLP → Swap 成 USDS → 还债 + 取出抵押品 → Flash Payback'
                  : '加杠杆：Flash Borrow USDS → Swap 成 JLP → 存入 + 借款 → Flash Payback'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 1️⃣ Position Overview - 最重要的信息 */}
              {publicKey ? (
                <div className="p-5 rounded-xl bg-gradient-to-br from-blue-950/30 to-slate-950/50 border-2 border-blue-900/50">
                  {/* Vault 选择 + Position ID 输入 */}
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Select value={vaultId.toString()} onValueChange={(val) => setVaultId(parseInt(val))}>
                        <SelectTrigger className="w-auto bg-slate-900/70 border-slate-700 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableVaults().map((vault) => (
                            <SelectItem key={vault.id} value={vault.id.toString()}>
                              {vault.name}
                            </SelectItem>
                          ))}
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
                    <>
                      {/* LTV Display */}
                      {positionInfo.ltv !== undefined && (
                        <div className="text-center mb-4 pb-4 border-b border-slate-700">
                          <div className="text-xs text-slate-400 mb-1">当前 LTV</div>
                          <div className={`text-5xl font-bold mb-1 ${
                            positionInfo.ltv < 70 ? 'text-green-400' :
                            positionInfo.ltv < 82 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {positionInfo.ltv.toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-500">
                            安全: &lt;70% · 警告: 70-82% · 危险: &gt;82% · 清算: {vaultConfig.liquidationLtv}%
                          </div>
                        </div>
                      )}

                      {/* Vault 基本信息 */}
                      <div className="text-center mb-4 pb-4 border-b border-slate-700">
                        <div className="text-xs text-slate-400 mb-1">{vaultConfig.name}</div>
                        <div className="text-sm text-slate-500">
                          Max LTV: {vaultConfig.maxLtv}% · 清算: {vaultConfig.liquidationLtv}%
                        </div>
                      </div>

                      {/* 抵押品 & 债务 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative group">
                          <div className="text-center p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-600 transition-colors cursor-pointer"
                               onClick={() => {
                                 setManageDialogType('collateral');
                                 setIsManageDialogOpen(true);
                               }}>
                            <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                              抵押品
                              <Settings className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xl font-bold text-green-400">
                              {positionInfo.collateralAmountUi.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-400">{TOKENS[vaultConfig.collateralToken].symbol}</div>
                          </div>
                          <div className="absolute inset-0 rounded-lg bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        </div>

                        <div className="relative group">
                          <div className="text-center p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-600 transition-colors cursor-pointer"
                               onClick={() => {
                                 setManageDialogType('debt');
                                 setIsManageDialogOpen(true);
                               }}>
                            <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                              债务
                              <Settings className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xl font-bold text-orange-400">
                              {positionInfo.debtAmountUi.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-400">{TOKENS[vaultConfig.debtToken].symbol}</div>
                          </div>
                          <div className="absolute inset-0 rounded-lg bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        </div>
                      </div>
                    </>
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
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-slate-950/50 border border-slate-800 text-center">
                  <p className="text-slate-400">请先连接钱包</p>
                </div>
              )}

              {/* 2️⃣ Operation Type Selector - 选择要做什么 */}
              <div className="space-y-3">
                <Label className="text-slate-300 text-sm">选择操作</Label>
                <div className="grid grid-cols-2 gap-3">
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
                      <TrendingDown className={`h-5 w-5 ${operationType === 'deleverageSwap' ? 'text-purple-500' : 'text-slate-400'}`} />
                      <span className={`font-semibold ${operationType === 'deleverageSwap' ? 'text-purple-500' : 'text-slate-400'}`}>
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
                      <TrendingUp className={`h-5 w-5 ${operationType === 'leverageSwap' ? 'text-cyan-500' : 'text-slate-400'}`} />
                      <span className={`font-semibold ${operationType === 'leverageSwap' ? 'text-cyan-500' : 'text-slate-400'}`}>
                        加杠杆
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">提高 LTV</p>
                  </button>
                </div>
              </div>

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
                      onValueChange={([value]) => setDepositAmount(value.toFixed(6))}
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

                  <p className="text-xs text-slate-500">
                    {operationType === 'leverageSwap'
                      ? '将 Flash Borrow USDS → Swap 成 JLP → 存入抵押并借出 USDS → 还回 Flash Loan'
                      : '将 Flash Borrow JLP → Swap 成 USDS → 还债并取出 JLP → 还回 Flash Loan'}
                  </p>
                </div>

                {/* 预测结果 */}
                {positionInfo && depositAmount && parseFloat(depositAmount) > 0 && positionInfo.ltv !== undefined && (() => {
                  const amount = parseFloat(depositAmount);
                  const currentCollateral = positionInfo.collateralAmountUi;
                  const currentDebt = positionInfo.debtAmountUi;

                  // 从当前 LTV 反推价格
                  // LTV = debt / (collateral * price)
                  // price = debt / (collateral * LTV / 100)
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

                  return (
                    <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700 space-y-3">
                      <div className="text-xs font-semibold text-slate-400">操作预测</div>

                      {/* 当前 → 预测 对比 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">LTV</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{positionInfo.ltv.toFixed(2)}%</span>
                            <span className="text-slate-600">→</span>
                            <span className={`font-bold ${
                              newLtv < 70 ? 'text-green-400' :
                              newLtv < 82 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {newLtv.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">抵押品 ({TOKENS[vaultConfig.collateralToken].symbol})</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{currentCollateral.toFixed(2)}</span>
                            <span className="text-slate-600">→</span>
                            <span className="font-medium text-cyan-400">{newCollateral.toFixed(2)}</span>
                            <span className={`text-xs ${operationType === 'leverageSwap' ? 'text-green-400' : 'text-red-400'}`}>
                              ({operationType === 'leverageSwap' ? '+' : ''}{(newCollateral - currentCollateral).toFixed(2)})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">债务 ({TOKENS[vaultConfig.debtToken].symbol})</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{currentDebt.toFixed(2)}</span>
                            <span className="text-slate-600">→</span>
                            <span className="font-medium text-cyan-400">{newDebt.toFixed(2)}</span>
                            <span className={`text-xs ${operationType === 'leverageSwap' ? 'text-orange-400' : 'text-green-400'}`}>
                              ({operationType === 'leverageSwap' ? '+' : ''}{(newDebt - currentDebt).toFixed(2)})
                            </span>
                          </div>
                        </div>
                      </div>

                      {newLtv > vaultConfig.maxLtv && (
                        <div className="text-xs text-red-400 bg-red-950/30 px-2 py-1 rounded">
                          ⚠️ 预测 LTV 超过最大值 {vaultConfig.maxLtv}%
                        </div>
                      )}
                    </div>
                  );
                })()}
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
            </CardContent>
          </Card>

          {/* Removed Stats Cards - info already displayed above */}
          <div className="hidden">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-400">当前 Vault</p>
                  <p className="text-2xl font-bold text-cyan-500">#{vaultConfig.id}</p>
                  <p className="text-xs text-slate-500 mt-1">{vaultConfig.name}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-400">最大 LTV</p>
                  <p className="text-2xl font-bold text-green-500">{vaultConfig.maxLtv}%</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-400">单笔交易</p>
                  <p className="text-2xl font-bold text-blue-500">1 TX</p>
                  <p className="text-xs text-slate-500 mt-1">原子操作</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-400">可用 Vault</p>
                  <p className="text-2xl font-bold text-purple-500">{getAvailableVaults().length}</p>
                  <p className="text-xs text-slate-500 mt-1">更多即将上线</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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
