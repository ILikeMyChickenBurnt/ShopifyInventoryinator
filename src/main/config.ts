import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// =============================================================================
// Types
// =============================================================================

export interface AppConfig {
  accessToken?: string;
  storeUrl?: string;
  clientId?: string;
  clientSecret?: string;
  autoSyncEnabled?: boolean;
  autoSyncIntervalMinutes?: number;
  [key: string]: unknown; // Allow additional properties during transition
}

export interface AutoSyncSettings {
  enabled: boolean;
  intervalMinutes: number;
}

// =============================================================================
// Internal Helpers
// =============================================================================

function getConfigPath(): string {
  const userDataPath = app.isPackaged
    ? app.getPath('userData')
    : path.join(__dirname, '../../data');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  return path.join(userDataPath, 'config.json');
}

// =============================================================================
// Core Config Functions
// =============================================================================

export function loadConfig(): AppConfig {
  try {
    const configPath = getConfigPath();

    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data) as AppConfig;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

  return {};
}

export function saveConfig(config: AppConfig): boolean {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('Config saved to:', configPath);
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

// =============================================================================
// Token & Credential Accessors
// =============================================================================

export function getAccessToken(): string | null {
  const config = loadConfig();
  return config.accessToken ?? null;
}

export function saveAccessToken(token: string): boolean {
  const config = loadConfig();
  config.accessToken = token;
  return saveConfig(config);
}

export function getStoreUrl(): string | null {
  const config = loadConfig();
  return config.storeUrl ?? process.env.SHOPIFY_STORE_URL ?? null;
}

export function saveStoreUrl(url: string): boolean {
  const config = loadConfig();
  config.storeUrl = url;
  return saveConfig(config);
}

export function clearCredentials(): boolean {
  const config = loadConfig();
  delete config.accessToken;
  return saveConfig(config);
}

// =============================================================================
// OAuth Client Credentials
// =============================================================================

export function getClientId(): string | null {
  const config = loadConfig();
  return config.clientId ?? process.env.SHOPIFY_CLIENT_ID ?? null;
}

export function getClientSecret(): string | null {
  const config = loadConfig();
  return config.clientSecret ?? process.env.SHOPIFY_CLIENT_SECRET ?? null;
}

export function saveOAuthCredentials(clientId: string, clientSecret: string): boolean {
  const config = loadConfig();
  config.clientId = clientId;
  config.clientSecret = clientSecret;
  return saveConfig(config);
}

// =============================================================================
// Status Checks
// =============================================================================

export function isConfigured(): boolean {
  const storeUrl = getStoreUrl();
  const accessToken = getAccessToken();
  const clientId = getClientId();
  const clientSecret = getClientSecret();

  return !!(storeUrl && accessToken && clientId && clientSecret);
}

export function hasOAuthCredentials(): boolean {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  return !!(clientId && clientSecret);
}

// =============================================================================
// Auto-Sync Settings
// =============================================================================

export function getAutoSyncSettings(): AutoSyncSettings {
  const config = loadConfig();
  return {
    enabled: config.autoSyncEnabled === true,
    intervalMinutes: typeof config.autoSyncIntervalMinutes === 'number'
      ? config.autoSyncIntervalMinutes
      : 5,
  };
}

export function saveAutoSyncSettings(enabled: boolean, intervalMinutes: number): boolean {
  const interval = parseInt(String(intervalMinutes), 10);
  if (isNaN(interval) || interval < 1) {
    throw new Error('Interval must be a positive integer of 1 or more');
  }

  const config = loadConfig();
  config.autoSyncEnabled = !!enabled;
  config.autoSyncIntervalMinutes = interval;
  return saveConfig(config);
}

// =============================================================================
// Exports
// =============================================================================

export default {
  loadConfig,
  saveConfig,
  getAccessToken,
  saveAccessToken,
  getStoreUrl,
  saveStoreUrl,
  clearCredentials,
  getClientId,
  getClientSecret,
  saveOAuthCredentials,
  isConfigured,
  hasOAuthCredentials,
  getAutoSyncSettings,
  saveAutoSyncSettings,
};
