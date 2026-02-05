import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
          <AuthProvider>
            {children}
          </AuthProvider>
        </WagmiProviderWrapper>
      </body>
    </html>
  );
}
