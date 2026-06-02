import type { AppSettings } from '../types';

const SETTINGS_KEY = 'skazitel-settings';

const DEFAULT_SETTINGS: AppSettings = {
  apiProvider: null,
  defaultDifficulty: 1,
  dailyGoal: 20,
  isOnboarded: false,
  exportFormat: 'json',
};

export async function getSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(SETTINGS_KEY, (result) => {
        if (result[SETTINGS_KEY]) {
          resolve({ ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] });
        } else {
          resolve(DEFAULT_SETTINGS);
        }
      });
    } else {
      // Fallback для разработки вне Chrome
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        resolve({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    }
  });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
        resolve();
      });
    } else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      resolve();
    }
  });
}
