import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Jito Block Engine HTTP API endpoints
 * Choose based on region for best performance
 */
const JITO_API_URLS = {
  'mainnet': 'https://mainnet.block-engine.jito.wtf/api/v1',
  'ny': 'https://ny.mainnet.block-engine.jito.wtf/api/v1',
  'tokyo': 'https://tokyo.mainnet.block-engine.jito.wtf/api/v1',
  'amsterdam': 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1',
  'frankfurt': 'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1',
};

/**
 * Jito tip accounts (randomly selected for each bundle)
 */
const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

/**
 * Get a random Jito tip account
 */
function getRandomTipAccount(): PublicKey {
  const randomIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[randomIndex]);
}

/**
 * Create a tip instruction for Jito bundle
 * @param payer - The account paying the tip
 * @param tipAmount - Tip amount in lamports (default: 10000 = 0.00001 SOL)
 */
export function createJitoTipInstruction(
  payer: PublicKey,
  tipAmount: number = 10000
): TransactionInstruction {
  const tipAccount = getRandomTipAccount();

  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: tipAccount,
    lamports: tipAmount,
  });
}

/**
 * Send a versioned transaction via Jito Bundle (HTTP API)
 * @param connection - Solana connection
 * @param transaction - The versioned transaction to send (must be signed)
 * @param tipAmount - Tip amount in lamports (default: 10000 = 0.00001 SOL, minimum: 1000)
 * @param region - Jito region (default: mainnet)
 */
export async function sendJitoBundle(
  connection: Connection,
  transaction: VersionedTransaction,
  tipAmount: number = 10000,
  region: keyof typeof JITO_API_URLS = 'mainnet'
): Promise<string> {
  console.log('\n════════════════════════════════════════');
  console.log('  Sending transaction via Jito Bundle');
  console.log('════════════════════════════════════════');
  console.log('Region:', region);
  console.log('Tip Amount:', tipAmount, 'lamports');

  // Enforce minimum tip
  if (tipAmount < 1000) {
    console.warn('⚠️  Tip amount below Jito minimum (1000 lamports), adjusting...');
    tipAmount = 1000;
  }

  const apiUrl = JITO_API_URLS[region];

  // Serialize the transaction to base64 (NOT base58!)
  const serializedTx = Buffer.from(transaction.serialize()).toString('base64');

  // Bundle contains just the main transaction
  // Tip should be added as an instruction INSIDE the transaction, not as separate TX
  const bundle = [serializedTx];

  console.log('Sending bundle to Jito HTTP API...');
  console.log('Transaction size:', transaction.serialize().length, 'bytes');

  try {
    // Send bundle via HTTP POST with proper encoding parameter
    const response = await fetch(`${apiUrl}/bundles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [
          bundle,
          {
            encoding: 'base64', // IMPORTANT: Must specify encoding
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Jito API error: ${JSON.stringify(data.error)}`);
    }

    const bundleId = data.result;
    console.log('✓ Bundle sent successfully!');
    console.log('Bundle ID:', bundleId);

    return bundleId;

  } catch (error) {
    console.error('❌ Failed to send Jito bundle:', error);
    throw new Error(`Jito bundle failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if Jito bundle is needed based on transaction size
 * @param transaction - The transaction to check
 * @returns true if TX is too large and needs Jito
 */
export function needsJitoBundle(transaction: VersionedTransaction): boolean {
  try {
    const serialized = transaction.serialize();
    const TX_SIZE_LIMIT = 1232;
    return serialized.length > TX_SIZE_LIMIT;
  } catch {
    // If serialization fails, it definitely needs Jito
    return true;
  }
}
