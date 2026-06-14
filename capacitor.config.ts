import type { CapacitorConfig } from "@capacitor/cli";

const appId = process.env.CAP_APP_ID || "com.ecovoyage.crm";
const appName = process.env.CAP_APP_NAME || "EcoVoyage CRM";
const serverUrl = (process.env.CAP_SERVER_URL || "").trim();

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: "out",
  android: {
    allowMixedContent: false,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: false,
      }
    : undefined,
};

export default config;
