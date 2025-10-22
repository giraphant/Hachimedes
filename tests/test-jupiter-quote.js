const { createJupiterApiClient } = require('@jup-ag/api');

const USDS_MINT = 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA';
const JLP_MINT = '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4';

async function testQuote() {
  console.log('Testing Jupiter quote for 20 USDS → JLP\n');

  const jupiterApi = createJupiterApiClient();

  // 20 USDS with 6 decimals
  const amount = 20 * 1e6; // 20,000,000
  const slippageBps = 50;

  console.log('Input:');
  console.log('  Token: USDS');
  console.log('  Amount (UI):', 20);
  console.log('  Amount (raw):', amount);
  console.log('  Decimals: 6\n');

  try {
    const quoteResponse = await jupiterApi.quoteGet({
      inputMint: USDS_MINT,
      outputMint: JLP_MINT,
      amount: amount,
      slippageBps: slippageBps,
    });

    console.log('Quote Response:');
    console.log('  inAmount:', quoteResponse.inAmount);
    console.log('  inAmount (UI with 6 decimals):', parseInt(quoteResponse.inAmount) / 1e6, 'USDS');
    console.log('  outAmount:', quoteResponse.outAmount);
    console.log('  outAmount (UI with 6 decimals):', parseInt(quoteResponse.outAmount) / 1e6, 'JLP');
    console.log('  otherAmountThreshold:', quoteResponse.otherAmountThreshold);
    console.log('  otherAmountThreshold (UI with 6 decimals):', parseInt(quoteResponse.otherAmountThreshold) / 1e6, 'JLP');
    console.log('  priceImpactPct:', quoteResponse.priceImpactPct);

    // Calculate implied price
    const inAmountUi = parseInt(quoteResponse.inAmount) / 1e6;
    const outAmountUi = parseInt(quoteResponse.outAmount) / 1e6;
    const impliedPrice = inAmountUi / outAmountUi;

    console.log('\nCalculated:');
    console.log('  Implied price:', impliedPrice.toFixed(4), 'USDS/JLP');
    console.log('  Expected price (from vault): ~5.30 USDS/JLP');

    if (Math.abs(impliedPrice - 5.30) < 0.5) {
      console.log('  ✅ Price looks correct!');
    } else {
      console.log('  ❌ Price mismatch!');
    }

  } catch (error) {
    console.error('Error getting quote:', error);
  }
}

testQuote();
