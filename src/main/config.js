const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Get the config file path
 */
function getConfigPath() {
  const userDataPath = app.isPackaged 
    ? app.getPath('userData')
    : path.join(__dirname, '../../data');
  
  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  return path.join(userDataPath, 'config.json');
}

/**
 * Load configuration from file
 */
function loadConfig() {
  try {
    const configPath = getConfigPath();
    
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  
  return {};
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
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

/**
 * Get stored access token
 */
function getAccessToken() {
  const config = loadConfig();
  return config.accessToken || null;
}

/**
 * Save access token
 */
function saveAccessToken(token) {
  const config = loadConfig();
  config.accessToken = token;
  return saveConfig(config);
}

/**
 * Get store URL
 */
function getStoreUrl() {
  const config = loadConfig();
  return config.storeUrl || process.env.SHOPIFY_STORE_URL || null;
}

/**
 * Save store URL
 */
function saveStoreUrl(url) {
  const config = loadConfig();
  config.storeUrl = url;
  return saveConfig(config);
}

/**
 * Clear all stored credentials
 */
function clearCredentials() {
  const config = loadConfig();
  delete config.accessToken;
  return saveConfig(config);
}

/**
 * Get OAuth client ID (from config or env)
 */
function getClientId() {
  const config = loadConfig();
  return config.clientId || process.env.SHOPIFY_CLIENT_ID || null;
}

/**
 * Get OAuth client secret (from config or env)
 */
function getClientSecret() {
  const config = loadConfig();
  return config.clientSecret || process.env.SHOPIFY_CLIENT_SECRET || null;
}

/**
 * Save OAuth credentials
 */
function saveOAuthCredentials(clientId, clientSecret) {
  const config = loadConfig();
  config.clientId = clientId;
  config.clientSecret = clientSecret;
  return saveConfig(config);
}

/**
 * Check if app is configured (has access token)
 */
function isConfigured() {
  const storeUrl = getStoreUrl();
  const accessToken = getAccessToken();
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  
  return !!(storeUrl && accessToken && clientId && clientSecret);
}

/**
 * Check if OAuth credentials are available
 */
function hasOAuthCredentials() {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  return !!(clientId && clientSecret);
}

/**
 * Get auto-sync settings
 */
function getAutoSyncSettings() {
  const config = loadConfig();
  return {
    enabled: config.autoSyncEnabled || false,
    intervalMinutes: config.autoSyncIntervalMinutes || 5
  };
}

/**
 * Save auto-sync settings
 */
function saveAutoSyncSettings(enabled, intervalMinutes) {
  // Validate interval is a positive integer >= 1
  const interval = parseInt(intervalMinutes, 10);
  if (isNaN(interval) || interval < 1) {
    throw new Error('Interval must be a positive integer of 1 or more');
  }
  
  const config = loadConfig();
  config.autoSyncEnabled = !!enabled;
  config.autoSyncIntervalMinutes = interval;
  return saveConfig(config);
}

module.exports = {
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
  saveAutoSyncSettings
};
