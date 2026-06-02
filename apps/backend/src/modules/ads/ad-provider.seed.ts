import type { NewAdProvider } from './ad-provider.repository.js';

/**
 * Default ad mediation waterfall (SPEC §"Ad waterfall"). AppLovin MAX runs as
 * the mediation manager on top; the rest are demand sources tried in priority
 * order (lower = first). eCPM / fill are operator estimates, tuned later from
 * real analytics — never shipped to the client. Ad unit ids are placeholders
 * (real ones live in env, §7); AdMob uses Google's public test rewarded unit.
 */
export function buildSeedAdProviders(): NewAdProvider[] {
  return [
    {
      key: 'applovin',
      name: 'AppLovin MAX',
      priority: 1,
      ecpmEstimate: 4.5,
      fillRate: 0.85,
      adUnitId: 'APPLOVIN_REWARDED_PLACEHOLDER',
    },
    {
      key: 'admob',
      name: 'Google AdMob',
      priority: 2,
      ecpmEstimate: 4.0,
      fillRate: 0.8,
      adUnitId: 'ca-app-pub-3940256099942544/5224354917',
    },
    {
      key: 'unity',
      name: 'Unity LevelPlay',
      priority: 3,
      ecpmEstimate: 3.0,
      fillRate: 0.7,
      adUnitId: 'UNITY_REWARDED_PLACEHOLDER',
    },
    {
      key: 'ironsource',
      name: 'ironSource',
      priority: 4,
      ecpmEstimate: 2.8,
      fillRate: 0.7,
      adUnitId: 'IRONSOURCE_REWARDED_PLACEHOLDER',
    },
    {
      key: 'yandex',
      name: 'Yandex Mobile Ads',
      priority: 5,
      ecpmEstimate: 3.5,
      fillRate: 0.75,
      adUnitId: 'YANDEX_REWARDED_PLACEHOLDER',
    },
    {
      key: 'pangle',
      name: 'Pangle',
      priority: 6,
      ecpmEstimate: 2.5,
      fillRate: 0.68,
      adUnitId: 'PANGLE_REWARDED_PLACEHOLDER',
    },
    {
      key: 'vungle',
      name: 'Liftoff / Vungle',
      priority: 7,
      ecpmEstimate: 2.2,
      fillRate: 0.65,
      adUnitId: 'VUNGLE_REWARDED_PLACEHOLDER',
    },
    {
      key: 'mintegral',
      name: 'Mintegral',
      priority: 8,
      ecpmEstimate: 2.0,
      fillRate: 0.62,
      adUnitId: 'MINTEGRAL_REWARDED_PLACEHOLDER',
    },
    {
      key: 'inmobi',
      name: 'InMobi',
      priority: 9,
      ecpmEstimate: 1.8,
      fillRate: 0.6,
      adUnitId: 'INMOBI_REWARDED_PLACEHOLDER',
    },
    {
      key: 'chartboost',
      name: 'Chartboost / DT Exchange',
      priority: 10,
      ecpmEstimate: 1.5,
      fillRate: 0.55,
      adUnitId: 'CHARTBOOST_REWARDED_PLACEHOLDER',
    },
  ];
}
