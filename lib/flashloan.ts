import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import BN from 'bn.js';

export interface FlashLoanParams {
  depositMint: PublicKey;
  depositAmount: number;
  borrowMint: PublicKey;
  borrowAmount: number;
  userPublicKey: PublicKey;
  vaultId?: number;
  positionId?: number;
  connection: Connection;
}

/**
 * 构建闪电贷交易（leverage: 同时存款和借款）
 *
 * 根据 Jupiter Lend 官方文档：
 * - colAmount > 0, debtAmount > 0 = Leverage (存款 + 借款)
 * - 使用 v0 versioned transactions
 * - positionId = 0 会自动创建新 position
 */
export async function buildFlashLoanTransaction(params: FlashLoanParams) {
  const {
    depositMint,
    depositAmount,
    borrowMint,
    borrowAmount,
    userPublicKey,
    vaultId = 0, // 默认 vault ID
    positionId = 0, // 0 表示自动创建新 position
    connection,
  } = params;

  console.log('Building flash loan transaction (leverage)...');
  console.log('VaultId:', vaultId);
  console.log('PositionId:', positionId);
  console.log('ColAmount:', depositAmount);
  console.log('DebtAmount:', borrowAmount);
  console.log('User PublicKey:', userPublicKey.toString());

  try {
    // 使用 getOperateIx 执行 leverage/deleverage 操作
    // colAmount > 0, debtAmount > 0: 存入抵押品 + 借款 (Leverage)
    // colAmount < 0, debtAmount < 0: 还款 + 取出抵押品 (Deleverage)
    console.log('Calling getOperateIx...');
    const result = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(depositAmount), // 抵押品数量（正数=存入，负数=取出）
      debtAmount: new BN(borrowAmount), // 借款数量（正数=借款，负数=还款）
      connection,
      signer: userPublicKey,
    });
    console.log('getOperateIx succeeded!');

    console.log('Instructions generated:', result.ixs.length);
    console.log('NFT Position ID:', result.nftId);
    console.log('Address lookup tables:', result.addressLookupTableAccounts?.length || 0);

    // 获取最新的区块哈希
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    // 使用 v0 versioned transaction（必须！）
    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: result.ixs,
    }).compileToV0Message(result.addressLookupTableAccounts || []);

    const transaction = new VersionedTransaction(messageV0);

    console.log('Versioned transaction built successfully');

    return {
      transaction,
      positionId: result.nftId,
      addressLookupTableAccounts: result.addressLookupTableAccounts,
    };
  } catch (error) {
    console.error('Error building flash loan transaction:', error);
    throw error;
  }
}
