import type { Translation } from './ru';

export const tr: Translation = {
  home: {
    timeLeft: 'Kalan süre',
    minutes: 'dk',
    hoursShort: 'sa',
    statusDisconnected: 'Bağlı değil',
    connectSoon: 'Bağlantı yakında gelecek',
    noServers: 'Sunucular yakında',
    watchAd: 'Reklam izle +{{minutes}} dk',
    loadingAd: 'Reklam yükleniyor…',
    verifying: 'Dakikalar ekleniyor…',
    adError: 'Reklam yüklenemedi. Tekrar deneyin.',
    rewardHint: '1 reklam = {{minutes}} dakika VPN',
  },
  servers: {
    title: 'Sunucular',
    ping: '{{ms}} ms',
    recommended: 'önerilen',
    auto: 'Otomatik',
    autoHint: 'En iyi sunucu otomatik',
    empty: 'Sunucu mevcut değil',
  },
  settings: {
    title: 'Ayarlar',
    language: 'Dil',
    app: 'Uygulama',
    lowEndMode: 'Tasarruf modu',
    lowEndModeHint: 'Daha az animasyon ve yenileme — zayıf telefonlar ve dengesiz internet için.',
    privacy: 'Trafiğinizin geçmişini ve içeriğini saklamıyoruz.',
    version: 'Sürüm',
  },
};
