'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';

export default function WalletTestPage() {
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleConnect = async () => {
    console.log('=== 开始连接 ===');
    console.log('wallet object:', wallet);
    console.log('wallet.wallet:', wallet.wallet);
    console.log('wallet.wallet.adapter:', wallet.wallet?.adapter);
    console.log('wallet.wallets:', wallet.wallets);
    console.log('wallet.connect:', wallet.connect);
    console.log('wallet.connecting:', wallet.connecting);
    console.log('wallet.connected:', wallet.connected);

    if (wallet.wallet?.adapter) {
      console.log('adapter.name:', wallet.wallet.adapter.name);
      console.log('adapter.connected:', wallet.wallet.adapter.connected);
      console.log('adapter.connecting:', wallet.wallet.adapter.connecting);
      console.log('adapter.readyState:', wallet.wallet.adapter.readyState);
    }

    try {
      console.log('调用 wallet.connect()...');
      const connectPromise = wallet.connect();
      console.log('Promise 对象:', connectPromise);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('连接超时（5秒）')), 5000);
      });

      const result = await Promise.race([connectPromise, timeoutPromise]);
      console.log('connect() 返回:', result);
      console.log('连接成功！');
    } catch (error: any) {
      console.error('连接失败 - 错误类型:', error?.constructor?.name);
      console.error('连接失败 - 错误详情:', error);
      console.error('连接失败 - 错误消息:', error?.message);
      console.error('连接失败 - 错误堆栈:', error?.stack);
    }
  };

  const handleDirectConnect = async () => {
    console.log('=== 直接连接 Phantom ===');
    const phantom = (window as any).phantom?.solana || (window as any).solana;
    console.log('Phantom object:', phantom);

    if (!phantom) {
      console.error('未检测到 Phantom 钱包');
      alert('未检测到 Phantom 钱包！请安装 Phantom 浏览器扩展。');
      return;
    }

    try {
      console.log('调用 phantom.connect()...');
      console.log('!!! 请检查浏览器是否有弹窗被拦截的提示 !!!');

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Phantom 连接超时（10秒）- 可能弹窗被拦截')), 10000);
      });

      const connectPromise = phantom.connect();
      const response = await Promise.race([connectPromise, timeoutPromise]);

      console.log('Phantom 连接成功:', response);
      console.log('Public Key:', response.publicKey.toString());
      alert('连接成功！Public Key: ' + response.publicKey.toString());
    } catch (error: any) {
      console.error('Phantom 连接失败:', error);
      alert('连接失败: ' + error.message + '\n\n请检查：\n1. 浏览器是否拦截了弹窗\n2. Phantom 扩展是否正常运行');
    }
  };

  const handleDisconnect = async () => {
    try {
      await wallet.disconnect();
      console.log('断开连接成功！');
    } catch (error) {
      console.error('断开连接失败:', error);
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-slate-950 text-white p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">手动钱包连接测试</h1>

      <div className="space-y-4 max-w-2xl">
        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl mb-4">钱包状态</h2>
          <div className="space-y-2 font-mono text-sm">
            <p>Connected: {wallet.connected ? '✅' : '❌'}</p>
            <p>Connecting: {wallet.connecting ? '⏳' : '✅'}</p>
            <p>Wallet Name: {wallet.wallet?.adapter.name || 'None'}</p>
            <p>Public Key: {wallet.publicKey?.toString() || 'None'}</p>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-lg">
          <h2 className="text-xl mb-4">操作</h2>
          <div className="space-x-4">
            <button
              onClick={handleConnect}
              disabled={wallet.connecting || wallet.connected}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-semibold"
            >
              通过 Adapter 连接
            </button>
            <button
              onClick={handleDirectConnect}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold"
            >
              直接连接 Phantom
            </button>
            <button
              onClick={handleDisconnect}
              disabled={!wallet.connected}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-semibold"
            >
              断开连接
            </button>
          </div>
        </div>

        <div className="bg-blue-900/30 border border-blue-500 p-6 rounded-lg">
          <p className="text-sm">
            打开浏览器控制台（F12）查看详细日志。点击"手动连接"按钮后查看控制台输出。
          </p>
        </div>
      </div>
    </div>
  );
}
