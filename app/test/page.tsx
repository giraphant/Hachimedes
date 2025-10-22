'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletButton } from '@/components/WalletButton';
import { useEffect, useState } from 'react';

export default function TestPage() {
  const { publicKey, connected, connecting, wallet } = useWallet();
  const { connection } = useConnection();
  const [rpcHealth, setRpcHealth] = useState<string>('checking...');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // 测试 RPC 连接
    connection.getVersion()
      .then((version) => {
        setRpcHealth(`✅ RPC Connected (v${version['solana-core']})`);
      })
      .catch((error) => {
        setRpcHealth(`❌ RPC Error: ${error.message}`);
      });
  }, [connection]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">钱包连接测试页面</h1>

      <div className="space-y-6 max-w-2xl">
        {/* 钱包连接按钮 */}
        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">1. 连接钱包</h2>
          <WalletButton />
        </div>

        {/* RPC 状态 */}
        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">2. RPC 状态</h2>
          <p className="font-mono text-sm">{rpcHealth}</p>
          <p className="text-slate-400 text-sm mt-2">
            Endpoint: {connection.rpcEndpoint}
          </p>
        </div>

        {/* 钱包状态 */}
        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">3. 钱包状态</h2>
          <div className="space-y-2 font-mono text-sm">
            {mounted ? (
              <>
                <p>Connected: <span className={connected ? 'text-green-500' : 'text-red-500'}>
                  {connected ? '✅ Yes' : '❌ No'}
                </span></p>
                <p>Connecting: <span className={connecting ? 'text-yellow-500' : 'text-slate-500'}>
                  {connecting ? '⏳ Yes' : '✅ No'}
                </span></p>
                <p>Wallet Name: {wallet?.adapter.name || 'None'}</p>
                <p>Public Key: {publicKey?.toString() || 'Not connected'}</p>
              </>
            ) : (
              <p>Loading...</p>
            )}
          </div>
        </div>

        {/* 检测到的钱包 */}
        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">4. 浏览器检测</h2>
          <div className="space-y-2 font-mono text-sm">
            {mounted ? (
              <>
                <p>Window.solana: {(window as any).solana ? '✅ 检测到' : '❌ 未检测到'}</p>
                <p>Window.phantom: {(window as any).phantom ? '✅ 检测到' : '❌ 未检测到'}</p>
                <p>Window.solflare: {(window as any).solflare ? '✅ 检测到' : '❌ 未检测到'}</p>
              </>
            ) : (
              <p>Loading...</p>
            )}
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-blue-900/30 border border-blue-500 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📝 调试说明</h2>
          <ul className="space-y-2 text-sm">
            <li>• 如果 "Connecting" 一直是 Yes，说明钱包适配器卡住了</li>
            <li>• 如果 RPC Error，说明网络连接有问题</li>
            <li>• 如果浏览器未检测到钱包，请确保已安装 Phantom 或 Solflare</li>
            <li>• 按 F12 打开控制台查看详细错误信息</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
