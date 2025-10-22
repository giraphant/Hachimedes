# Hachimedes

> "Give me a lever, and I can move Jupiter." - Archimedes (adapted)

A powerful Flash Loan interface for Jupiter Lend on Solana, enabling one-click leverage and deleverage operations.

## Features

- 🚀 **One-Click Leverage/Deleverage**: Execute complex DeFi operations in a single transaction
- ⚡ **Flash Loan Integration**: Utilize Jupiter Lend's flash loan capabilities
- 🔄 **Auto Swap**: Automatically swap tokens via Jupiter Aggregator
- 🎯 **Position Management**: Easily manage your lending positions
- 🔍 **NFT-based Position Discovery**: Automatically find your positions (supports up to 100,000 position IDs)
- 📊 **Real-time LTV Display**: Monitor your loan-to-value ratio in real-time

## Supported Vaults

- JLP/USDC (Vault 8)
- JLP/USDG (Vault 10)
- JLP/USDS (Vault 34) - Default

## How It Works

### Leverage (加杠杆)
1. Flash Borrow USDS from Jupiter Lend
2. Swap USDS → JLP via Jupiter Aggregator
3. Deposit JLP as collateral + Borrow USDS
4. Repay Flash Loan

All in **one atomic transaction**!

### Deleverage (去杠杆)
1. Flash Borrow JLP from Jupiter Lend
2. Swap JLP → USDS via Jupiter Aggregator
3. Repay debt + Withdraw JLP collateral
4. Repay Flash Loan

All in **one atomic transaction**!

## Tech Stack

- **Framework**: Next.js 14 + React
- **Blockchain**: Solana
- **Wallet**: Solana Wallet Adapter
- **DeFi Protocol**: Jupiter Lend SDK
- **DEX Aggregator**: Jupiter Swap API
- **UI**: Tailwind CSS + shadcn/ui
- **Language**: TypeScript

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Hachimedes.git
   cd Hachimedes
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and add your RPC endpoint:
   ```env
   NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
   # Or use a paid RPC for better performance:
   # NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## Position Discovery

The app features an intelligent NFT-based position discovery system:

- **Quick Search**: Most positions found in < 1 second (0-1,000 range)
- **Deep Search**: Supports position IDs up to 100,000
- **Batch Strategy**: Searches in batches to maintain UI responsiveness
- **Progress Feedback**: Real-time loading indicators

Performance:
- 3-digit Position IDs (0-999): ~300ms
- 4-digit Position IDs (1000-9999): ~3s
- 5-digit Position IDs (10000-99999): ~20-30s

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Documentation

- [Position NFT Discovery](./POSITION_NFT_DISCOVERY.md)
- [Position Search Optimization](./POSITION_SEARCH_OPTIMIZATION.md)
- [UX Loading Fix](./UX_FIX_LOADING.md)
- [Vaults Added](./VAULTS_ADDED.md)

## Security

- ⚠️ This is experimental software. Use at your own risk.
- ⚠️ Always verify transactions before signing
- ⚠️ Never share your private keys or seed phrases
- ⚠️ Start with small amounts for testing

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Jupiter](https://jup.ag/) - For the amazing DeFi protocols
- [Solana](https://solana.com/) - For the high-performance blockchain
- [shadcn/ui](https://ui.shadcn.com/) - For the beautiful UI components

---

Built with ❤️ for the Solana DeFi community
