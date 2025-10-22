'use client';

import dynamic from 'next/dynamic';

const FlashLoanInterface = dynamic(
  () => import('@/components/FlashLoanInterface').then((mod) => ({ default: mod.FlashLoanInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    ),
  }
);

export default function Home() {
  return <FlashLoanInterface />;
}
