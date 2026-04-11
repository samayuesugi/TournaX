import fs from "fs";
import path from "path";

const SETTINGS_FILE = path.join(process.cwd(), "platform-settings.json");

export interface PlatformSettings {
  platformFeePercent: number;
  storePriceOverrides: Record<string, number>;
  featuredPlayerIds: number[];
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platformFeePercent: 5,
  storePriceOverrides: {},
  featuredPlayerIds: [],
};

export function getSettings(): PlatformSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: PlatformSettings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
