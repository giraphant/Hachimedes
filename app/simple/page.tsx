'use client';

import { useState, useEffect } from 'react';

export default function SimplePage() {
  const [wallet, setWallet] = useState<any>(null);
  const [address, setAddress] = useState<string>('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // 检测 Phantom 钱包
    if (typeof window !== 'undefined' && (window as any).solana) {
      setWallet((window as any).solana);
    }
  }, []);

  const connect = async () => {
    if (!wallet) {
      alert('请先安装 Phantom 钱包');
      return;
    }

    try {
      setConnecting(true);
      const resp = await wallet.connect();
      setAddress(resp.publicKey.toString());
      console.log('连接成功:', resp.publicKey.toString());
    } catch (error: any) {
      console.error('连接失败:', error);
      alert('连接失败: ' + error.message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (wallet) {
      await wallet.disconnect();
      setAddress('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">超简单钱包连接测试</h1>

      <div className="max-w-2xl space-y-6">
        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl mb-4">直接连接 Phantom</h2>

          <div className="space-y-4">
            <p>检测到钱包: {wallet ? '✅ 是' : '❌ 否'}</p>

            {!address ? (
              <button
                onClick={connect}
                disabled={connecting || !wallet}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-semibold"
              >
                {connecting ? '连接中...' : '连接 Phantom'}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-green-500">✅ 已连接</p>
                <p className="font-mono text-sm break-all">{address}</p>
                <button
                  onClick={disconnect}
                  className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold"
                >
                  断开连接
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-900/30 border border-blue-500 p-6 rounded-lg">
          <h3 className="font-semibold mb-2">说明</h3>
          <p className="text-sm">
            这是最简单的直接调用 Phantom API 的方式，不使用任何 Solana RPC。
            如果这个能连上，说明是适配器的配置问题。
          </p>
        </div>
      </div>
    </div>
  );
}
