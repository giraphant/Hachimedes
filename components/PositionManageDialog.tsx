'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { PositionInfo } from '@/lib/position';
import { Slider } from '@/components/ui/slider';
import { getVaultConfig } from '@/lib/vaults';

type OperationType = 'deposit' | 'withdraw' | 'borrow' | 'repay';

interface PositionManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positionInfo: PositionInfo;
  vaultId: number;
  positionId: number;
  onSuccess?: () => void;
  initialType?: 'collateral' | 'debt'; // 初始选择抵押品还是债务管理
}

export function PositionManageDialog({
  open,
  onOpenChange,
  positionInfo,
  vaultId,
  positionId,
  onSuccess,
  initialType = 'collateral',
}: PositionManageDialogProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  const [operationType, setOperationType] = useState<OperationType>(
    initialType === 'collateral' ? 'deposit' : 'borrow'
  );
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 钱包余额
  const [walletBalances, setWalletBalances] = useState<{
    collateral: number;
    debt: number;
  }>({ collateral: 0, debt: 0 });
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  // 获取钱包余额
  const loadWalletBalances = async () => {
    if (!publicKey) return;

    setIsLoadingBalances(true);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getAccount, getAssociatedTokenAddressSync } = await import('@solana/spl-token');

      const vc = getVaultConfig(vaultId);

      const collateralAta = getAssociatedTokenAddressSync(
        new PublicKey(vc.collateralMint),
        publicKey
      );
      const debtAta = getAssociatedTokenAddressSync(
        new PublicKey(vc.debtMint),
        publicKey
      );

      const [collateralAccount, debtAccount] = await Promise.all([
        getAccount(connection, collateralAta).catch(() => null),
        getAccount(connection, debtAta).catch(() => null),
      ]);

      setWalletBalances({
        collateral: collateralAccount
          ? Number(collateralAccount.amount) / Math.pow(10, vc.collateralDecimals)
          : 0,
        debt: debtAccount
          ? Number(debtAccount.amount) / Math.pow(10, vc.debtDecimals)
          : 0,
      });
    } catch (error) {
      console.error('Error loading wallet balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  // 根据 initialType 更新 operationType
  useEffect(() => {
    if (open) {
      setOperationType(initialType === 'collateral' ? 'deposit' : 'borrow');
      setAmount('');
      loadWalletBalances();
    }
  }, [open, initialType, publicKey]);

  // 计算最大可用金额
  const maxAmount = (() => {
    const vaultConfig = getVaultConfig(vaultId);
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    const currentPrice = positionInfo.ltv
      ? currentDebt / (currentCollateral * positionInfo.ltv / 100)
      : 0;

    switch (operationType) {
      case 'deposit':
        // 最大存入 = 钱包余额
        return walletBalances.collateral;

      case 'withdraw':
        // 最大取出 = 在不超过 maxLtv 的情况下可以取出的最大抵押品
        if (currentDebt === 0) return currentCollateral;
        const minCollateralNeeded = currentDebt / (currentPrice * vaultConfig.maxLtv / 100);
        return Math.max(0, currentCollateral - minCollateralNeeded);

      case 'borrow':
        // 最大借出 = 在不超过 maxLtv 的情况下可以借出的最大债务
        const maxDebt = currentCollateral * currentPrice * vaultConfig.maxLtv / 100;
        return Math.max(0, maxDebt - currentDebt);

      case 'repay':
        // 最大偿还 = min(钱包余额, 当前债务)
        return Math.min(walletBalances.debt, currentDebt);

      default:
        return 0;
    }
  })();

  // 计算预测的新 LTV
  const predictedValues = (() => {
    if (!amount || parseFloat(amount) <= 0 || !positionInfo.ltv) {
      return null;
    }

    const amountNum = parseFloat(amount);
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;

    // 从当前 LTV 反推价格
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    let newCollateral = currentCollateral;
    let newDebt = currentDebt;

    switch (operationType) {
      case 'deposit':
        newCollateral = currentCollateral + amountNum;
        break;
      case 'withdraw':
        newCollateral = currentCollateral - amountNum;
        break;
      case 'borrow':
        newDebt = currentDebt + amountNum;
        break;
      case 'repay':
        newDebt = currentDebt - amountNum;
        break;
    }

    // 检查是否有效
    if (newCollateral <= 0 || newDebt < 0) {
      return null;
    }

    const newLtv = newDebt > 0 ? (newDebt / (newCollateral * currentPrice)) * 100 : 0;

    return {
      newCollateral,
      newDebt,
      newLtv,
    };
  })();

  const handleExecute = async () => {
    if (!publicKey || !signTransaction) {
      toast({
        title: '钱包未连接',
        description: '请先连接您的钱包',
        variant: 'destructive',
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: '请输入金额',
        description: '金额必须大于 0',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getOperateIx } = await import('@jup-ag/lend/borrow');
      const BN = (await import('bn.js')).default;
      const { TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');

      const amountNum = parseFloat(amount);
      const vc = getVaultConfig(vaultId);

      // 使用代币原生精度，而不是固定的 1e9
      // JLP = 6 decimals, SOL = 9 decimals, etc.
      const isCollateralOp = operationType === 'deposit' || operationType === 'withdraw';
      const decimals = isCollateralOp ? vc.collateralDecimals : vc.debtDecimals;
      const amountRaw = Math.floor(amountNum * Math.pow(10, decimals));

      console.log(`[PositionManage] ${operationType}: ${amountNum} UI → ${amountRaw} raw (${decimals} decimals)`);

      // 根据操作类型设置 colAmount 和 debtAmount
      let colAmount = new BN(0);
      let debtAmount = new BN(0);

      switch (operationType) {
        case 'deposit':
          colAmount = new BN(amountRaw);
          break;
        case 'withdraw':
          colAmount = new BN(-amountRaw);
          break;
        case 'borrow':
          debtAmount = new BN(amountRaw);
          break;
        case 'repay':
          debtAmount = new BN(-amountRaw);
          break;
      }

      toast({
        title: '正在构建交易',
        description: '请稍候...',
      });

      // 获取 Operate 指令
      const operateResult = await getOperateIx({
        vaultId,
        positionId,
        colAmount,
        debtAmount,
        connection,
        signer: publicKey,
        recipient: publicKey,
        positionOwner: publicKey,
      });

      // 构建交易
      const latestBlockhash = await connection.getLatestBlockhash('finalized');

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: operateResult.ixs,
      }).compileToV0Message(operateResult.addressLookupTableAccounts || []);

      const transaction = new VersionedTransaction(messageV0);

      // 签名
      toast({
        title: '请在钱包中确认交易',
        description: '正在等待签名...',
      });

      const signedTx = await signTransaction(transaction);

      // 发送交易
      toast({
        title: '正在发送交易',
        description: '请稍候...',
      });

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      toast({
        title: '交易已发送',
        description: '等待确认...',
      });

      // 等待确认
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');

      toast({
        title: '操作成功！',
        description: `交易签名: ${signature.slice(0, 8)}...`,
      });

      // 关闭 dialog 并刷新数据
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Operation error:', error);
      toast({
        title: '操作失败',
        description: error.message || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const operationLabels = {
    deposit: `存入 ${getVaultConfig(vaultId).collateralToken}`,
    withdraw: `取出 ${getVaultConfig(vaultId).collateralToken}`,
    borrow: `借入 ${getVaultConfig(vaultId).debtToken}`,
    repay: `偿还 ${getVaultConfig(vaultId).debtToken}`,
  };

  const operationIcons = {
    deposit: <TrendingUp className="h-4 w-4 text-green-500" />,
    withdraw: <TrendingDown className="h-4 w-4 text-orange-500" />,
    borrow: <TrendingUp className="h-4 w-4 text-blue-500" />,
    repay: <TrendingDown className="h-4 w-4 text-purple-500" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>仓位管理</DialogTitle>
          <DialogDescription>
            调整抵押品或债务
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 操作类型选择 */}
          <div className="space-y-2">
            <Label>选择操作</Label>
            <Select
              value={operationType}
              onValueChange={(value) => setOperationType(value as OperationType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">
                  <div className="flex items-center gap-2">
                    {operationIcons.deposit}
                    <span>存入 {getVaultConfig(vaultId).collateralToken}</span>
                  </div>
                </SelectItem>
                <SelectItem value="withdraw">
                  <div className="flex items-center gap-2">
                    {operationIcons.withdraw}
                    <span>取出 {getVaultConfig(vaultId).collateralToken}</span>
                  </div>
                </SelectItem>
                <SelectItem value="borrow">
                  <div className="flex items-center gap-2">
                    {operationIcons.borrow}
                    <span>借入 {getVaultConfig(vaultId).debtToken}</span>
                  </div>
                </SelectItem>
                <SelectItem value="repay">
                  <div className="flex items-center gap-2">
                    {operationIcons.repay}
                    <span>偿还 {getVaultConfig(vaultId).debtToken}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 金额输入 with Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>
                金额 ({operationType === 'deposit' || operationType === 'withdraw' ? getVaultConfig(vaultId).collateralToken : getVaultConfig(vaultId).debtToken})
              </Label>
              <div className="text-xs text-muted-foreground">
                {isLoadingBalances ? (
                  <span>加载中...</span>
                ) : (
                  <span>
                    可用: {' '}
                    <span className="font-mono text-foreground">
                      {maxAmount.toFixed(4)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Input with Max button */}
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0"
                max={maxAmount}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(maxAmount.toFixed(6))}
                disabled={maxAmount === 0}
                className="px-3"
              >
                MAX
              </Button>
            </div>

            {/* Slider - Always show */}
            <div className="space-y-2">
              <Slider
                value={[parseFloat(amount) || 0]}
                onValueChange={([value]) => setAmount(value.toFixed(6))}
                max={maxAmount > 0 ? maxAmount : 1}
                step={maxAmount > 0 ? maxAmount / 100 : 0.01}
                disabled={maxAmount === 0}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>{maxAmount > 0 ? (maxAmount * 0.5).toFixed(2) : '0.00'}</span>
                <span>{maxAmount > 0 ? maxAmount.toFixed(2) : '0.00'}</span>
              </div>
              {maxAmount === 0 && (
                <div className="text-xs text-amber-400 text-center">
                  {operationType === 'deposit' || operationType === 'repay'
                    ? '余额不足'
                    : '当前仓位暂不支持此操作'}
                </div>
              )}
            </div>
          </div>

          {/* 当前状态 */}
          <div className="p-3 rounded-lg bg-secondary border border-border space-y-2">
            <div className="text-sm font-medium text-foreground/80">当前仓位</div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">抵押品</div>
                <div className="font-mono">{positionInfo.collateralAmountUi.toFixed(4)} {getVaultConfig(vaultId).collateralToken}</div>
              </div>
              <div>
                <div className="text-muted-foreground">债务</div>
                <div className="font-mono">{positionInfo.debtAmountUi.toFixed(2)} {getVaultConfig(vaultId).debtToken}</div>
              </div>
              <div>
                <div className="text-muted-foreground">LTV</div>
                <div className="font-mono">{positionInfo.ltv?.toFixed(2) || 'N/A'}%</div>
              </div>
            </div>
          </div>

          {/* 预测状态 */}
          {predictedValues && (
            <div className="p-3 rounded-lg bg-secondary border border-border space-y-2">
              <div className="text-sm font-medium text-foreground/80">操作后预估</div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">抵押品</div>
                  <div className="font-mono text-foreground">
                    {predictedValues.newCollateral.toFixed(4)} {getVaultConfig(vaultId).collateralToken}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">债务</div>
                  <div className="font-mono text-foreground">
                    {predictedValues.newDebt.toFixed(2)} {getVaultConfig(vaultId).debtToken}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">LTV</div>
                  <div
                    className={`font-mono ${
                      predictedValues.newLtv > 82
                        ? 'text-red-400'
                        : predictedValues.newLtv > 70
                        ? 'text-yellow-400'
                        : 'text-green-400'
                    }`}
                  >
                    {predictedValues.newLtv.toFixed(2)}%
                  </div>
                </div>
              </div>
              {predictedValues.newLtv > 82 && (
                <div className="text-xs text-red-400 mt-2">
                  LTV 将超过清算线，操作风险极高！
                </div>
              )}
            </div>
          )}

          {/* 执行按钮 */}
          <Button
            onClick={handleExecute}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                {operationIcons[operationType]}
                <span className="ml-2">{operationLabels[operationType]}</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
