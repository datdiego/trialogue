/**
 * LocalStorage Helpers
 * Manages browser storage for app preferences.
 * API keys are kept in sessionStorage only (never localStorage).
 */

const STORAGE_KEYS = {
  API_KEYS: 'trialogue_api_keys_session',
  LEGACY_API_KEYS: 'trialogue_api_keys',
  SELECTED_MODELS: 'trialogue_selected_models',
  DARK_MODE: 'trialogue_dark_mode',
} as const;

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  groq?: string;
}

let inMemoryApiKeys: ApiKeys = {};

export const storage = {
  /**
   * Get stored API keys
   */
  getApiKeys(): ApiKeys {
    if (typeof window === 'undefined') return {};
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.API_KEYS);
      if (stored) {
        const parsed = JSON.parse(stored);
        inMemoryApiKeys = parsed;
        return parsed;
      }

      // Cleanup legacy insecure localStorage keys if present.
      const legacy = localStorage.getItem(STORAGE_KEYS.LEGACY_API_KEYS);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_API_KEYS);
        inMemoryApiKeys = parsedLegacy;
        sessionStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(parsedLegacy));
        return parsedLegacy;
      }

      return inMemoryApiKeys;
    } catch {
      return inMemoryApiKeys;
    }
  },

  /**
   * Save API keys to storage
   */
  setApiKeys(keys: ApiKeys): void {
    if (typeof window === 'undefined') return;
    try {
      inMemoryApiKeys = keys;
      sessionStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(keys));
      localStorage.removeItem(STORAGE_KEYS.LEGACY_API_KEYS);
    } catch (error) {
      console.error('Failed to save API keys:', error);
    }
  },

  /**
   * Get a specific API key by provider
   */
  getApiKey(provider: keyof ApiKeys): string | undefined {
    return this.getApiKeys()[provider];
  },

  /**
   * Set a specific API key for a provider
   */
  setApiKey(provider: keyof ApiKeys, key: string): void {
    const keys = this.getApiKeys();
    keys[provider] = key;
    this.setApiKeys(keys);
  },

  /**
   * Remove a specific API key
   */
  removeApiKey(provider: keyof ApiKeys): void {
    const keys = this.getApiKeys();
    delete keys[provider];
    this.setApiKeys(keys);
  },

  /**
   * Clear all API keys
   */
  clearApiKeys(): void {
    if (typeof window === 'undefined') return;
    inMemoryApiKeys = {};
    sessionStorage.removeItem(STORAGE_KEYS.API_KEYS);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_API_KEYS);
  },

  /**
   * Get selected models
   */
  getSelectedModels(): string[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_MODELS);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Save selected models
   */
  setSelectedModels(models: string[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_MODELS, JSON.stringify(models));
    } catch (error) {
      console.error('Failed to save selected models:', error);
    }
  },

  /**
   * Get dark mode preference
   */
  getDarkMode(): boolean | null {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  /**
   * Set dark mode preference
   */
  setDarkMode(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.DARK_MODE, JSON.stringify(enabled));
    } catch (error) {
      console.error('Failed to save dark mode preference:', error);
    }
  },
};
