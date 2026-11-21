import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.democoin.wallet',
  appName: 'DemoCoin Wallet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
