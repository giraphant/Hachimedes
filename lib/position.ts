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
 * 从预言机读取价格（支持多种格式）
 * Ported from Matsu's juplend.py _read_oracle_price / _parse_oracle_data
 *
 * Supported formats:
 * - Oracle wrapper (disc 8bc283b38cb3e5f4): resolves inner oracle recursively
 * - Pyth V2 (~3312 bytes): expo@20, price@208
 * - jup3 oracle (~196 bytes, disc 87c75210f983b6f1): price@107, scale 1e12
 * - Jupiter Lend oracle (~134 bytes): price@73, scale 1e8
 */
async function readPriceFromOracle(
  connection: Connection,
  oracleAddress: string
): Promise<number | null> {
  try {
    const oracleAccount = await connection.getAccountInfo(new PublicKey(oracleAddress));
    if (!oracleAccount) return null;

    const data = oracleAccount.data;

    // Oracle wrapper (disc 8bc283b38cb3e5f4): resolve inner oracle
    const ORACLE_WRAPPER_DISC = Buffer.from('8bc283b38cb3e5f4', 'hex');
    if (data.length >= 46 && data.subarray(0, 8).equals(ORACLE_WRAPPER_DISC)) {
      const innerOracleAddress = new PublicKey(data.subarray(14, 46)).toString();
      console.log(`[oracle] Wrapper detected, resolving inner oracle: ${innerOracleAddress.slice(0, 8)}...`);
      return readPriceFromOracle(connection, innerOracleAddress);
    }

    // Pyth V2 format (large account ~3312 bytes)
    if (data.length > 1000) {
      if (data.length >= 216) {
        const expo = data.readInt32LE(20);
        const rawPrice = data.readBigInt64LE(208);
        const price = Number(rawPrice) * Math.pow(10, expo);
        return price > 0 ? price : null;
      }
      return null;
    }

    // jup3 oracle format (~196 bytes, disc 87c75210f983b6f1)
    const JUP3_ORACLE_DISC = Buffer.from('87c75210f983b6f1', 'hex');
    if (data.length >= 115 && data.subarray(0, 8).equals(JUP3_ORACLE_DISC)) {
      const rawPrice = data.readBigUInt64LE(107);
      const price = Number(rawPrice) / 1e12;
      return price > 0 ? price : null;
    }

    // Jupiter Lend oracle format (small account ~134 bytes)
    const PRICE_OFFSET = 73;
    const PRICE_SCALE = 1e8;
    if (data.length >= PRICE_OFFSET + 8) {
      const rawPrice = data.readBigUInt64LE(PRICE_OFFSET);
      const price = Number(rawPrice) / PRICE_SCALE;
      return price > 0 && isFinite(price) ? price : null;
    }

    return null;
  } catch (error) {
    console.error('Error reading oracle price:', error);
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
