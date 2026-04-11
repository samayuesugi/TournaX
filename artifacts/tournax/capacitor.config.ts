import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tournax.app",
  appName: "TournaX",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0f0f1a",
      showSpinner: false,
    },
  },
};

export default config;
