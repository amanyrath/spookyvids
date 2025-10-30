import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface AppSettings {
  openaiApiKey?: string;
  pixabayApiKey?: string;
}

const SETTINGS_FILE = 'settings.json';

class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings = {};

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE);
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        this.settings = JSON.parse(data);
        console.log('Loaded settings from:', this.settingsPath);
      } else {
        console.log('No settings file found, using defaults');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.settings = {};
    }
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
      console.log('Settings saved to:', this.settingsPath);
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  getSetting(key: keyof AppSettings): string | undefined {
    return this.settings[key];
  }

  setSetting(key: keyof AppSettings, value: string): void {
    this.settings[key] = value;
    this.saveSettings();
  }

  getAllSettings(): AppSettings {
    return { ...this.settings };
  }

  clearSettings(): void {
    this.settings = {};
    this.saveSettings();
  }

  hasRequiredKeys(): boolean {
    return !!(this.settings.openaiApiKey && this.settings.pixabayApiKey);
  }
}

// Singleton instance
let settingsInstance: SettingsManager | null = null;

export function getSettings(): SettingsManager {
  if (!settingsInstance) {
    settingsInstance = new SettingsManager();
  }
  return settingsInstance;
}

