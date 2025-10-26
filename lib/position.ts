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

    // 预言机数据格式：前 8 字节是 discriminator
    // 价格通常存储在某个固定 offset
    const DISCRIMINATOR_SIZE = 8;

    // 尝试多个可能的 offset 来找到价格数据
    // 价格可能使用 1e8, 1e6, 或其他缩放因子
    const possibleScales = [1e8, 1e6, 1e9, 1e10];

    console.log('Trying to parse oracle data...');
    for (let offset = DISCRIMINATOR_SIZE; offset < Math.min(oracleAccount.data.length - 8, 120); offset += 8) {
      const rawValue = oracleAccount.data.readBigUInt64LE(offset);
      if (rawValue > 0n) {
        for (const scale of possibleScales) {
          const price = Number(rawValue) / scale;
          // JLP 价格应该在 1-20 USD 范围内
          if (price >= 1 && price <= 20) {
            console.log(`Found potential price at offset ${offset}: ${price.toFixed(6)} (scale: ${scale})`);
            return price;
          }
        }
      }
    }

    console.error('Could not find valid price in oracle data');
    return null;
  } catch (error) {
    console.error('Error reading oracle price:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return null;
  }
}

/**
 * 从 Vault 读取预言机地址并获取价格
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

    console.log('Vault data length:', vaultAccount.data.length);

    // Vault 结构中应该包含预言机地址 (32 字节的 PublicKey)
    // 尝试在常见位置查找预言机地址
    const DISCRIMINATOR_SIZE = 8;

    // 预言机地址可能在 offset 8-40 之间的某个位置
    // 先尝试 offset 8 (紧跟 discriminator 之后)
    if (vaultAccount.data.length >= DISCRIMINATOR_SIZE + 32) {
      const oracleBytes = vaultAccount.data.slice(DISCRIMINATOR_SIZE, DISCRIMINATOR_SIZE + 32);
      const oracleAddress = new PublicKey(oracleBytes).toBase58();

      console.log('Extracted oracle address from vault:', oracleAddress);

      // 从预言机读取价格
      return await readPriceFromOracle(connection, oracleAddress);
    }

    console.error('Vault data too short to contain oracle address');
    return null;
  } catch (error) {
    console.error('Error reading price from vault:', error);
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
