import type { Translation } from './ru';

export const tr: Translation = {
  language: {
    title: 'Dil seçin',
    subtitle: 'Daha sonra ayarlardan değiştirebilirsiniz',
  },
  onboarding: {
    next: 'İleri',
    start: 'Başla',
    slides: {
      free: {
        title: 'Ücretsiz VPN',
        body: 'Abonelik ve kayıt olmadan hızlı ve güvenli erişim.',
      },
      reward: {
        title: 'Reklam = süre',
        body: 'İzlenen bir reklam — 30 dakika VPN.',
      },
      accumulate: {
        title: 'Süre biriktirin',
        body: 'Dakikalar saklanır ve birikir — bir yıla kadar.',
      },
      autostop: {
        title: 'Otomatik kapanma',
        body: 'Süre bittiğinde VPN otomatik olarak kapanır.',
      },
    },
    privacy: 'Trafiğinizin geçmişini ve içeriğini saklamıyoruz.',
  },
  home: {
    greeting: 'Bağlanmaya hazır mısınız?',
    balance: 'Süreniz',
    minutes: 'dk',
    connect: 'Bağlan',
    watchAd: 'Reklam izle +{{minutes}} dk',
    selectServer: 'Sunucu seç',
    statusDisconnected: 'Bağlı değil',
    comingSoon: 'Yakında',
    loadingAd: 'Reklam yükleniyor…',
    verifying: 'Dakikalar ekleniyor…',
    adError: 'Reklam yüklenemedi. Tekrar deneyin.',
  },
  settings: {
    lowEndMode: 'Tasarruf modu',
    lowEndModeHint: 'Daha az animasyon ve yenileme — zayıf telefonlar ve dengesiz internet için.',
  },
};
