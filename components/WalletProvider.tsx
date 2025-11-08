'use client';

import { FC, ReactNode, useMemo, useCallback } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import type { WalletError } from '@solana/wallet-adapter-base';

import '@solana/wallet-adapter-react-ui/styles.css';

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // 使用环境变量中的 RPC 或使用公共端点（较慢但安全）
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
    []
  );

  // 空钱包数组 - 让浏览器扩展自动注入
  const wallets = useMemo(() => [], []);

  // 错误处理
  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error.message || error.name);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
