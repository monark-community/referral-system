import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // MetaMask SDK pulls in React Native storage — stub it out in browsers
      "@react-native-async-storage/async-storage": "./src/lib/stubs/empty.js",
      // WalletConnect pulls in pino-pretty (a Node.js logger) — stub it out
      "pino-pretty": "./src/lib/stubs/empty.js",
    },
  },
  // Webpack aliases (used in production builds)
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
