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
  oraclePrice?: number; // Pyth 预言机价格 (collateral/debt)
}

/**
 * 从预言机读取价格
 * @param connection Solana 连接
 * @param oracleAddress 预言机地址
 * @returns 价格
 */
async function readPriceFromOracle(
  connection: Connection,
  oracleAddress: string
): Promise<number | null> {
  try {
    console.log('Reading price from oracle:', oracleAddress);
    const oracleAccount = await connection.getAccountInfo(new PublicKey(oracleAddress));

    if (!oracleAccount) {
      console.error('Oracle account not found:', oracleAddress);
      return null;
    }

    console.log('Oracle account data length:', oracleAccount.data.length);

    // 预言机价格存储在 offset 73，使用 1e8 缩放因子
    const PRICE_OFFSET = 73;
    const PRICE_SCALE = 1e8;

    if (oracleAccount.data.length < PRICE_OFFSET + 8) {
      console.error('Oracle data too short. Expected at least', PRICE_OFFSET + 8, 'bytes, got', oracleAccount.data.length);
      return null;
    }

    const rawPrice = oracleAccount.data.readBigUInt64LE(PRICE_OFFSET);
    const price = Number(rawPrice) / PRICE_SCALE;

    console.log('Raw price value:', rawPrice.toString());
    console.log('Oracle price:', price.toFixed(8));

    // 验证价格合理性
    if (price <= 0 || !isFinite(price)) {
      console.error('Invalid price value:', price);
      return null;
    }

    return price;
  } catch (error) {
    console.error('Error reading oracle price:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return null;
  }
}

/**
 * 从 Vault 配置获取预言机地址并读取价格
 * @param connection Solana 连接
 * @param vaultId Vault ID
 * @returns 价格（collateral 相对于 debt 的价格）
 */
async function readPriceForVault(
  connection: Connection,
  vaultId: number
): Promise<number | null> {
  try {
    const vaultConfig = getVaultConfig(vaultId);

    // 直接使用配置中的预言机地址
    return await readPriceFromOracle(connection, vaultConfig.oracleAddress);
  } catch (error) {
    console.error('Error reading price for vault:', error);
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

    // 计算 LTV（使用预言机价格）
    let ltv: number | undefined;
    let oraclePrice: number | undefined;
    if (collateralAmountUi > 0 && debtAmountUi > 0) {
      try {
        // 获取 Vault 配置
        const vaultConfig = getVaultConfig(vaultId);

        // 从预言机读取价格
        const price = await readPriceForVault(connection, vaultId);

        if (price) {
          oraclePrice = price; // 保存预言机价格
          // LTV = debt / (collateral × price) × 100
          // price 是 collateral 相对于 debt 的价格
          ltv = (debtAmountUi / (collateralAmountUi * price)) * 100;

          console.log('Collateral price:', price.toFixed(6), 'per', vaultConfig.collateralToken);
          console.log('Calculated LTV:', ltv.toFixed(2) + '%');
        } else {
          console.warn('Failed to read price from oracle, LTV not available');
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
      oraclePrice,
    };
  } catch (error) {
    console.error('Error fetching position:', error);
    return null;
  }
}
