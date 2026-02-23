import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      // MetaMask SDK pulls in React Native storage — stub it out in browsers
      "@react-native-async-storage/async-storage": false,
      // WalletConnect pulls in pino-pretty (a Node.js logger) — stub it out
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
