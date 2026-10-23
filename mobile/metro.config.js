// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite web önizlemesi wa-sqlite'ın .wasm dosyasını yükler.
config.resolver.assetExts.push('wasm');

// Web'de SQLite, SharedArrayBuffer için cross-origin izolasyonu ister.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
