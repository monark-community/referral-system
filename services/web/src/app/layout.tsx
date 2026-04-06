// Purpose: Root layout for the Next.js app - wraps every page with global providers and styles
// Notes:
// - Wagmi (blockchain wallet), React Query (data fetching), and Auth providers are nested here so they are available app-wide
// - Uses the Inter font and enforces dark mode

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { WagmiProviderWrapper } from "@/providers/wagmi-provider";
import { AuthProvider } from "@/contexts/auth-context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Reffinity - Referral Program",
  description: "Invite friends, boost your network & earn together",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <WagmiProviderWrapper>
          <QueryProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </QueryProvider>
        </WagmiProviderWrapper>
      </body>
    </html>
  );
}
