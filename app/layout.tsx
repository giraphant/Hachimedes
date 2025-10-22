import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hachimedes",
  description: "Give me a lever, and I can move Jupiter - One-click leverage and deleverage operations on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <WalletContextProvider>
          {children}
          <Toaster />
        </WalletContextProvider>
      </body>
    </html>
  );
}
