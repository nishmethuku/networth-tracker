import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nishmethuku.networth",
  appName: "Net Worth",
  webDir: "dist",
  backgroundColor: "#faf7f2",
  ios: { contentInset: "never" },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: "#faf7f2" },
  },
};

export default config;
