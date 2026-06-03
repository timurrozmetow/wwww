export const ru = {
  home: {
    timeLeft: 'Осталось времени',
    minutes: 'мин',
    hoursShort: 'ч',
    statusDisconnected: 'Отключено',
    connectSoon: 'Подключение появится скоро',
    noServers: 'Серверы появятся скоро',
    watchAd: 'Смотреть рекламу +{{minutes}} мин',
    loadingAd: 'Загрузка рекламы…',
    verifying: 'Начисляем минуты…',
    adError: 'Не удалось загрузить рекламу. Попробуйте ещё раз.',
    rewardHint: '1 ролик = {{minutes}} минут VPN',
  },
  servers: {
    title: 'Серверы',
    ping: '{{ms}} мс',
    recommended: 'рекомендуемый',
    auto: 'Авто',
    autoHint: 'Лучший сервер автоматически',
    empty: 'Серверы пока недоступны',
  },
  settings: {
    title: 'Настройки',
    language: 'Язык',
    app: 'Приложение',
    lowEndMode: 'Эконом-режим',
    lowEndModeHint:
      'Меньше анимаций и обновлений — для слабых телефонов и нестабильного интернета.',
    privacy: 'Мы не храним историю и содержимое вашего трафика.',
    version: 'Версия',
  },
};

export type Translation = typeof ru;
