const { PublicKey, Connection } = require('@solana/web3.js');

const VAULTS_PROGRAM_ID = new PublicKey('Ho32sUQ4NzuAQgkPkHuNDG3G18rgHmYtXFA8EBmqQrAu');
const connection = new Connection('https://leonore-805z4o-fast-mainnet.helius-rpc.com');

async function findPosition() {
  console.log('Searching for position 335...\n');

  // Try different vault IDs
  for (let vaultId = 0; vaultId <= 100; vaultId++) {
    const positionId = 335;
    const [position] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        Buffer.from([vaultId & 0xFF, (vaultId >> 8) & 0xFF]),
        Buffer.from([positionId & 0xFF, (positionId >> 8) & 0xFF, (positionId >> 16) & 0xFF, (positionId >> 24) & 0xFF])
      ],
      VAULTS_PROGRAM_ID
    );

    try {
      const info = await connection.getAccountInfo(position);
      if (info) {
        console.log('FOUND! VaultId:', vaultId, 'Position:', position.toString());
        console.log('Account data length:', info.data.length, 'bytes');
        return vaultId;
      }
    } catch (error) {
      // Continue searching
    }
  }

  console.log('Position not found in vaults 0-100');
}

findPosition().catch(console.error);
