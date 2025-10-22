import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getDepositIx } from '@jup-ag/lend/earn';
import { getOperateIx } from '@jup-ag/lend/borrow';
import BN from 'bn.js';
import { RPC_ENDPOINT } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      depositMint,
      depositAmount,
      borrowMint,
      borrowAmount,
      userPublicKey,
      vaultId = 0, // 默认 vault ID，需要根据实际情况调整
      positionId, // 可选：如果有现有 position
      computeUnitLimit = 400000,
      priorityFee = 10000,
    } = body;

    // 验证参数
    if (!depositMint || !depositAmount || !borrowMint || !borrowAmount || !userPublicKey) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    console.log('Executing flash loan:', {
      depositMint,
      depositAmount,
      borrowMint,
      borrowAmount,
      userPublicKey,
    });

    // 创建连接
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const signer = new PublicKey(userPublicKey);

    // 构建交易
    console.log('Building transaction...');
    const transaction = new Transaction();

    // 添加计算单元限制
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit,
      })
    );

    // 添加优先费用
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      })
    );

    // 1. 获取存款指令（Earn - Deposit）
    console.log('Getting deposit instruction...');
    const depositIx = await getDepositIx({
      amount: new BN(depositAmount),
      asset: new PublicKey(depositMint),
      signer,
      connection,
    });
    transaction.add(depositIx);

    // 2. 获取借款指令（Borrow - Operate）
    console.log('Getting borrow instruction...');
    const borrowResult = await getOperateIx({
      vaultId,
      positionId: positionId || 0, // 如果没有现有 position，会创建新的
      colAmount: new BN(depositAmount), // 抵押品数量（通常和存款相同）
      debtAmount: new BN(borrowAmount), // 借款数量
      connection,
      signer,
    });

    // 添加 borrow 相关的指令
    for (const ix of borrowResult.ixs) {
      transaction.add(ix);
    }

    // 获取最新的区块哈希
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer;

    // 如果有 address lookup tables，需要特殊处理
    let serializedTransaction: string;

    if (borrowResult.addressLookupTableAccounts && borrowResult.addressLookupTableAccounts.length > 0) {
      // 使用 versioned transaction 支持 lookup tables
      const { TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');

      const messageV0 = new TransactionMessage({
        payerKey: signer,
        recentBlockhash: blockhash,
        instructions: transaction.instructions,
      }).compileToV0Message(borrowResult.addressLookupTableAccounts);

      const versionedTx = new VersionedTransaction(messageV0);
      serializedTransaction = Buffer.from(versionedTx.serialize()).toString('base64');
    } else {
      // 常规交易
      const txBuffer = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      serializedTransaction = txBuffer.toString('base64');
    }

    console.log('Transaction built successfully');
    console.log('NFT Position ID:', borrowResult.nftId);

    // 返回序列化的交易给前端签名
    return NextResponse.json({
      transaction: serializedTransaction,
      positionId: borrowResult.nftId,
      message: 'Transaction ready for signing',
    });

  } catch (error: any) {
    console.error('Flash loan API error:', error);
    return NextResponse.json(
      {
        error: error.message || '执行闪电贷时发生错误',
        details: error.toString(),
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
