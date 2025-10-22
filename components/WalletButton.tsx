'use client';

import dynamic from 'next/dynamic';

// 动态导入钱包按钮，禁用 SSR
const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export const WalletButton = () => {
  return <WalletMultiButtonDynamic />;
};
