import { Connection, PublicKey } from '@solana/web3.js';
import { getCurrentPosition, getCurrentPositionState } from '@jup-ag/lend/borrow';
import { getVaultConfig } from './vaults';

export interface PositionInfo {
  positionId: number;
  vaultId: number;
  owner: string;
  collateralAmount: number;
  collateralAmountUi: number;
  debtAmount: number;
  debtAmountUi: number;
  healthFactor?: number;
  ltv?: number;
}

/**
 * 从 Vault 读取价格
 * @param connection Solana 连接
 * @param vaultAddress Vault 地址
 * @returns 价格（collateral 相对于 debt 的价格）
 */
async function readPriceFromVault(
  connection: Connection,
  vaultAddress: string
): Promise<number | null> {
  try {
    const vaultAccount = await connection.getAccountInfo(new PublicKey(vaultAddress));
    if (!vaultAccount) {
      console.error('Vault account not found');
      return null;
    }

    // Vault 使用 Anchor 格式，前 8 字节是 discriminator
    // 价格存储在 offset 73（从文件开始）= offset 65（从 discriminator 之后）
    // 使用 1e8 作为缩放因子
    const DISCRIMINATOR_SIZE = 8;
    const PRICE_OFFSET_FROM_DISCRIMINATOR = 65;
    const TOTAL_PRICE_OFFSET = DISCRIMINATOR_SIZE + PRICE_OFFSET_FROM_DISCRIMINATOR;
    const PRICE_SCALE = 1e8;

    if (vaultAccount.data.length < TOTAL_PRICE_OFFSET + 8) {
      console.error('Vault data too short');
      return null;
    }

    const rawPrice = vaultAccount.data.readBigUInt64LE(TOTAL_PRICE_OFFSET);
    const price = Number(rawPrice) / PRICE_SCALE;

    console.log('Vault price:', price.toFixed(8));
    return price;
  } catch (error) {
    console.error('Error reading vault price:', error);
    return null;
  }
}

/**
 * 获取仓位信息
 */
export async function fetchPositionInfo(
  connection: Connection,
  vaultId: number,
  positionId: number,
  owner: PublicKey
): Promise<PositionInfo | null> {
  try {
    console.log(`Fetching position ${positionId} from vault ${vaultId}...`);

    // 使用 SDK 的 getCurrentPosition 方法获取仓位账户
    const position = await getCurrentPosition({
      connection,
      vaultId,
      positionId,
    });

    if (!position) {
      console.log('Position not found');
      return null;
    }

    console.log('Position account:', position);

    // SDK 返回的是 BN 对象，需要转换为数值
    // 使用 toNumber() 对于小数值，或者 toString() 然后 parseInt 对于大数值
    const collateralAmount = position.colRaw ? Number(position.colRaw.toString()) : 0;
    const debtAmount = position.debtRaw ? Number(position.debtRaw.toString()) : 0;

    console.log('Parsed amounts:');
    console.log('  Collateral (raw):', collateralAmount);
    console.log('  Debt (raw):', debtAmount);

    // Jupiter Lend 内部使用 9 位小数精度
    const collateralAmountUi = collateralAmount / 1e9;
    const debtAmountUi = debtAmount / 1e9;

    console.log('UI amounts:');
    console.log('  Collateral:', collateralAmountUi);
    console.log('  Debt:', debtAmountUi);

    // 计算 LTV（使用 Vault 中的价格）
    let ltv: number | undefined;
    if (collateralAmountUi > 0 && debtAmountUi > 0) {
      try {
        // 获取 Vault 配置
        const vaultConfig = getVaultConfig(vaultId);

        // 从 Vault 读取价格
        const price = await readPriceFromVault(connection, vaultConfig.vaultAddress);

        if (price) {
          // LTV = debt / (collateral × price) × 100
          // price 是 collateral 相对于 debt 的价格
          ltv = (debtAmountUi / (collateralAmountUi * price)) * 100;

          console.log('Collateral price:', price.toFixed(6), 'USDS per', vaultConfig.collateralToken);
          console.log('Calculated LTV:', ltv.toFixed(2) + '%');
        } else {
          console.warn('Failed to read price from vault, LTV not available');
        }
      } catch (e) {
        console.error('Failed to calculate LTV:', e);
      }
    }

    return {
      positionId,
      vaultId,
      owner: owner.toString(),
      collateralAmount,
      collateralAmountUi,
      debtAmount,
      debtAmountUi,
      ltv,
    };
  } catch (error) {
    console.error('Error fetching position:', error);
    return null;
  }
}
