'use client';

import { useState, useMemo, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Loader2, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AmountInput } from '@/components/common/AmountInput';
import { PreviewCard } from '@/components/common/PreviewCard';
import { AdvancedSettings, AdvancedSettingsState } from './AdvancedSettings';
import { useToast } from '@/hooks/use-toast';
import { PositionInfo } from '@/lib/position';
import { VaultConfig } from '@/lib/vaults';

interface DeleveragePanelProps {
  positionInfo: PositionInfo | null;
  vaultConfig: VaultConfig;
  selectedPositionId: number | null;
  onSuccess: () => void;
  onPreviewChange?: (preview: { ltv?: number; collateral?: number; debt?: number } | null) => void;
}

export function DeleveragePanel({ positionInfo, vaultConfig, selectedPositionId, onSuccess, onPreviewChange }: DeleveragePanelProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AdvancedSettingsState>({
    slippageBps: 5,
    priorityFee: 'default',
    selectedDexes: [],
    onlyDirectRoutes: false,
    useJitoBundle: false,
    maxAccounts: 32,
  });

  // Max amount: min(currentCollateral, currentDebt / price)
  const maxAmount = useMemo(() => {
    if (!positionInfo || !positionInfo.ltv) return 0;
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) return 0;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);
    if (currentDebt === 0) return currentCollateral;
    return Math.min(currentCollateral, currentDebt / currentPrice);
  }, [positionInfo]);

  // Preview
  const previewData = useMemo(() => {
    if (!positionInfo || !amount || isNaN(parseFloat(amount)) || positionInfo.ltv === undefined) return null;
    const amountNum = parseFloat(amount);
    const currentCollateral = positionInfo.collateralAmountUi;
    const currentDebt = positionInfo.debtAmountUi;
    if (currentCollateral === 0 || positionInfo.ltv === 0 || currentDebt === 0) return null;
    const currentPrice = currentDebt / (currentCollateral * positionInfo.ltv / 100);

    const newCollateral = currentCollateral - amountNum;
    const newDebt = currentDebt - (amountNum * currentPrice);
    const newLtv = newCollateral > 0 && newDebt > 0 ? (newDebt / (newCollateral * currentPrice)) * 100 : 0;

    return { newCollateral, newDebt, newLtv, exceedsMax: newLtv > vaultConfig.maxLtv };
  }, [positionInfo, amount, vaultConfig.maxLtv]);

  // Notify parent
  useMemo(() => {
    if (onPreviewChange) {
      onPreviewChange(previewData ? { ltv: previewData.newLtv, collateral: previewData.newCollateral, debt: previewData.newDebt } : null);
    }
  }, [previewData, onPreviewChange]);

  const handleExecute = useCallback(async () => {
    if (!publicKey || !signTransaction || !amount || selectedPositionId === null) return;

    if (settings.onlyDirectRoutes) {
      toast({ title: '使用直接路由', description: '直接路由可能导致较高磨损，请注意检查交易详情' });
    }

    setIsLoading(true);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const collateralMintPk = new PublicKey(vaultConfig.collateralMint);
      const debtMintPk = new PublicKey(vaultConfig.debtMint);

      let transaction: any;
      let transactions: any[] = [];
      let positionId: any;
      let swapQuote: any;

      if (settings.useJitoBundle) {
        toast({ title: '正在构建 Jito Bundle (3 TX)', description: 'Withdraw → Swap → Repay' });
        const { buildDeleverageJitoBundle } = await import('@/lib/deleverage-jito-bundle');
        const result = await buildDeleverageJitoBundle({
          collateralMint: collateralMintPk, debtMint: debtMintPk, withdrawAmount: parseFloat(amount),
          userPublicKey: publicKey, vaultId: vaultConfig.id, positionId: selectedPositionId, connection,
          slippageBps: settings.slippageBps, preferredDexes: settings.selectedDexes.length > 0 ? settings.selectedDexes : undefined,
          onlyDirectRoutes: settings.onlyDirectRoutes, maxAccounts: settings.maxAccounts,
          debtDecimals: vaultConfig.debtDecimals, collateralDecimals: vaultConfig.collateralDecimals,
        });
        transactions = result.transactions; positionId = result.positionId; swapQuote = result.swapQuote;
      } else {
        toast({ title: '正在构建 Flash Loan 交易', description: 'Flash Borrow → Swap → Repay → Flash Payback' });
        const { buildDeleverageFlashLoanSwap } = await import('@/lib/deleverage-flashloan-swap');
        const result = await buildDeleverageFlashLoanSwap({
          collateralMint: collateralMintPk, debtMint: debtMintPk, flashLoanAmount: parseFloat(amount),
          userPublicKey: publicKey, vaultId: vaultConfig.id, positionId: selectedPositionId, connection,
          slippageBps: settings.slippageBps, preferredDexes: settings.selectedDexes.length > 0 ? settings.selectedDexes : undefined,
          onlyDirectRoutes: settings.onlyDirectRoutes, maxAccounts: settings.maxAccounts, useJitoBundle: false,
          debtDecimals: vaultConfig.debtDecimals, collateralDecimals: vaultConfig.collateralDecimals,
        });
        transaction = result.transaction; positionId = result.positionId; swapQuote = result.swapQuote;
      }

      // Price warning
      let priceWarning = '';
      if (swapQuote && positionInfo) {
        const debtScale = Math.pow(10, vaultConfig.debtDecimals);
        const collateralScale = Math.pow(10, vaultConfig.collateralDecimals);
        const inputAmt = parseInt(swapQuote.inputAmount) / collateralScale;
        const outputAmt = parseInt(swapQuote.outputAmount) / debtScale;
        const tradePrice = outputAmt / inputAmt;
        if (positionInfo.oraclePrice) {
          const oraclePrice = positionInfo.oraclePrice;
          const deviation = ((tradePrice - oraclePrice) / oraclePrice) * 100;
          priceWarning = `\n预言机价格: $${oraclePrice.toFixed(4)}\n交易价格: $${tradePrice.toFixed(4)}\n价格偏差: ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}%\n请检查价格是否合理`;
        } else {
          priceWarning = `\n交易价格: $${tradePrice.toFixed(4)} ${vaultConfig.debtToken}/${vaultConfig.collateralToken}\n请检查价格是否合理`;
        }
      }

      toast({ title: '请在钱包中确认交易', description: settings.useJitoBundle ? `需要签名 3 个交易${priceWarning}` : `正在等待签名...${priceWarning}` });

      let signedTransactions: any[] = [];
      if (settings.useJitoBundle) {
        for (const tx of transactions) signedTransactions.push(await signTransaction(tx));
      } else {
        signedTransactions = [await signTransaction(transaction)];
      }

      let signature: string;
      if (settings.useJitoBundle) {
        toast({ title: '正在通过 Jito Bundle 发送', description: `发送 ${signedTransactions.length} 个交易的原子 Bundle...` });
        const { sendJitoMultiTxBundle } = await import('@/lib/jito-bundle');
        signature = await sendJitoMultiTxBundle(connection, signedTransactions);
      } else {
        toast({ title: '正在发送交易', description: '请稍候...' });
        signature = await connection.sendTransaction(signedTransactions[0], { skipPreflight: false, preflightCommitment: 'confirmed' });
      }

      toast({ title: '正在确认交易', description: '这可能需要几秒钟...' });
      await connection.confirmTransaction(signature, 'confirmed');

      toast({
        title: '减杠杆执行成功！',
        description: (
          <div className="mt-2 space-y-1">
            {positionId && <p>Position ID: {positionId}</p>}
            <p>交易签名: {signature.slice(0, 8)}...{signature.slice(-8)}</p>
            <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">在 Solscan 上查看</a>
          </div>
        ),
      });

      setAmount('');
      onSuccess();
    } catch (error: any) {
      console.error('Deleverage error:', error);
      const isTxTooLarge = error.message && (error.message.includes('Transaction exceeds maximum size') || error.message.includes('Transaction too large'));
      if (isTxTooLarge) {
        const suggestions = [];
        if (settings.maxAccounts > 20) suggestions.push(`降低「最大账户数」到 ${settings.maxAccounts === 32 ? 28 : settings.maxAccounts === 28 ? 24 : 20}`);
        if (!settings.onlyDirectRoutes) suggestions.push('切换到「仅直接路由」');
        if (!settings.useJitoBundle) suggestions.push('启用 Jito Bundle');
        toast({ title: '交易过大（超过 1232 bytes）', description: `请在高级设置中尝试：${suggestions.join('、')}`, variant: 'destructive' });
      } else {
        toast({ title: '闪电贷执行失败', description: error.message || '发生未知错误', variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, amount, selectedPositionId, settings, vaultConfig, connection, positionInfo, toast, onSuccess]);

  const ltvColor = (v: number) => v < 70 ? 'text-green-400' : v < vaultConfig.maxLtv ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {positionInfo && (
        <div className="text-xs text-muted-foreground">
          当前仓位: {vaultConfig.name} #{selectedPositionId}
        </div>
      )}

      <div className="p-4 rounded-lg bg-background/50 border border-border">
        <AmountInput
          label={`提取数量 (${vaultConfig.collateralToken})`}
          value={amount}
          onChange={setAmount}
          maxAmount={maxAmount}
        />
      </div>

      {previewData && positionInfo && (
        <PreviewCard
          rows={[
            { label: 'LTV', currentValue: `${positionInfo.ltv!.toFixed(1)}%`, newValue: `${previewData.newLtv.toFixed(1)}%`, colorClass: ltvColor(previewData.newLtv) },
            { label: '抵押品', currentValue: `${positionInfo.collateralAmountUi.toFixed(2)} ${vaultConfig.collateralToken}`, newValue: `${previewData.newCollateral.toFixed(2)} ${vaultConfig.collateralToken}` },
            { label: '债务', currentValue: `${positionInfo.debtAmountUi.toFixed(2)} ${vaultConfig.debtToken}`, newValue: `${previewData.newDebt.toFixed(2)} ${vaultConfig.debtToken}` },
          ]}
          warning={previewData.exceedsMax ? `LTV 将超过安全上限 ${vaultConfig.maxLtv}%，请谨慎操作` : undefined}
        />
      )}

      <AdvancedSettings {...settings} onChange={(partial) => setSettings((prev) => ({ ...prev, ...partial }))} />

      <Button
        onClick={handleExecute}
        disabled={!publicKey || isLoading || !amount || selectedPositionId === null}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        size="lg"
      >
        {isLoading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />执行中...</>
        ) : (
          <><Zap className="mr-2 h-4 w-4" />执行减杠杆</>
        )}
      </Button>

      {publicKey && amount && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-xs">风险提示</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-yellow-300/80">
              <li>原子交易: 全部成功或全部回滚，资金安全</li>
              <li>请确保钱包持有足够 SOL 作为交易手续费</li>
              <li>操作前请仔细核对参数，交易一经确认不可撤销</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
