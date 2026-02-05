import { Connection, PublicKey } from '@solana/web3.js';
import { getCurrentPosition, getCurrentPositionState } from '@jup-ag/lend/borrow';
import { getVaultConfig } from './vaults';
import { STABLECOIN_SYMBOLS } from './constants';

// Pyth Hermes API for fetching SOL and other token prices
const PYTH_HERMES_URL = 'https://hermes.pyth.network/api/latest_price_feeds';
// Pyth price feed IDs (from pyth.network)
const PYTH_PRICE_FEEDS: Record<string, string> = {
  // SOL and variants (all use SOL price)
  SOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  bSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  JitoSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  mSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  stSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  jupSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  hSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  LST: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  superSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  bbSOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  INF: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',  // Infinity SOL
  // ETH
  ETH: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  // BTC variants (all use BTC price)
  BTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  wBTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  cbBTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  LBTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  xBTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  // JUP
  JUP: '0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
};

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
  oraclePrice?: number;  // 抵押品 USD 价格
  debtPrice?: number;    // 债务代币 USD 价格 (稳定币 = 1.0)
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
 * 从 Pyth Hermes API 获取代币的 USD 价格
 * @param symbol 代币符号 (如 "SOL", "ETH")
 * @returns USD 价格，或 null
 */
async function fetchPriceFromPyth(symbol: string): Promise<number | null> {
  const feedId = PYTH_PRICE_FEEDS[symbol];
  if (!feedId) {
    console.warn(`[pyth] No price feed ID for ${symbol}`);
    return null;
  }

  try {
    const url = `${PYTH_HERMES_URL}?ids[]=${feedId}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[pyth] HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    for (const feed of data || []) {
      const priceData = feed?.price;
      if (priceData?.price !== undefined && priceData?.expo !== undefined) {
        const price = parseFloat(priceData.price) * Math.pow(10, priceData.expo);
        console.log(`[pyth] ${symbol} price: $${price.toFixed(4)}`);
        return price;
      }
    }
    return null;
  } catch (error) {
    console.error(`[pyth] Error fetching ${symbol} price:`, error);
    return null;
  }
}

/**
 * 获取债务代币的 USD 价格
 * - 稳定币返回 $1.0
 * - 非稳定币从 Pyth 获取价格
 */
async function getDebtPriceUsd(debtSymbol: string): Promise<number | null> {
  if (STABLECOIN_SYMBOLS.has(debtSymbol)) {
    return 1.0;
  }
  return fetchPriceFromPyth(debtSymbol);
}

/**
 * 从 Vault 配置获取预言机地址并读取抵押品价格 (USD)
 * @param connection Solana 连接
 * @param vaultId Vault ID
 * @returns 抵押品的 USD 价格
 */
async function readCollateralPriceForVault(
  connection: Connection,
  vaultId: number
): Promise<number | null> {
  try {
    const vaultConfig = getVaultConfig(vaultId);
    return await readPriceFromOracle(connection, vaultConfig.oracleAddress);
  } catch (error) {
    console.error('Error reading collateral price for vault:', error);
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
    // LTV = (debt × debtPrice) / (collateral × collateralPrice) × 100
    let ltv: number | undefined;
    let oraclePrice: number | undefined;
    let debtPrice: number | undefined;
    if (collateralAmountUi > 0 && debtAmountUi > 0) {
      try {
        // 获取 Vault 配置
        const vaultConfig = getVaultConfig(vaultId);

        // 从预言机读取抵押品 USD 价格
        const collateralPriceUsd = await readCollateralPriceForVault(connection, vaultId);
        // 获取债务代币 USD 价格（稳定币 = $1，非稳定币从 Pyth 获取）
        const debtPriceUsd = await getDebtPriceUsd(vaultConfig.debtToken);

        if (collateralPriceUsd && debtPriceUsd) {
          oraclePrice = collateralPriceUsd;
          debtPrice = debtPriceUsd;

          // 正确的 LTV 公式：(债务价值 USD) / (抵押品价值 USD) × 100
          const debtValueUsd = debtAmountUi * debtPriceUsd;
          const collateralValueUsd = collateralAmountUi * collateralPriceUsd;
          ltv = (debtValueUsd / collateralValueUsd) * 100;

          console.log(`Collateral: ${collateralAmountUi.toFixed(4)} ${vaultConfig.collateralToken} @ $${collateralPriceUsd.toFixed(4)} = $${collateralValueUsd.toFixed(2)}`);
          console.log(`Debt: ${debtAmountUi.toFixed(4)} ${vaultConfig.debtToken} @ $${debtPriceUsd.toFixed(4)} = $${debtValueUsd.toFixed(2)}`);
          console.log('Calculated LTV:', ltv.toFixed(2) + '%');
        } else {
          console.warn(`Failed to get prices: collateral=$${collateralPriceUsd}, debt=$${debtPriceUsd}`);
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
      debtPrice,
    };
  } catch (error) {
    console.error('Error fetching position:', error);
    return null;
  }
}
