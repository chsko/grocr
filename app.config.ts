import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json is the config. The web export for grocr.io/app sets GROCR_WEB_BASE_URL=/app, which
 * only that export reads; native builds and EAS updates never see a base URL. That export also
 * drops Expo Router's generated /_sitemap, which would list every screen of the app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const baseUrl = process.env.GROCR_WEB_BASE_URL;
  if (!baseUrl) return config as ExpoConfig;
  return {
    ...(config as ExpoConfig),
    experiments: { ...config.experiments, baseUrl },
    plugins: config.plugins?.map((plugin) =>
      plugin === 'expo-router' ? ['expo-router', { sitemap: false }] : plugin,
    ),
  };
};
