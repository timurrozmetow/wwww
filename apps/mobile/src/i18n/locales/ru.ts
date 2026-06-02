export const ru = {
  language: {
    title: 'Выберите язык',
    subtitle: 'Вы сможете изменить его позже в настройках',
  },
  onboarding: {
    next: 'Далее',
    start: 'Начать',
    slides: {
      free: {
        title: 'Бесплатный VPN',
        body: 'Быстрый и безопасный доступ без подписки и регистрации.',
      },
      reward: {
        title: 'Реклама = время',
        body: 'Один просмотренный ролик — 30 минут VPN.',
      },
      accumulate: {
        title: 'Копите время',
        body: 'Минуты сохраняются и накапливаются — до одного года.',
      },
      autostop: {
        title: 'Авто-отключение',
        body: 'Когда время заканчивается, VPN отключается автоматически.',
      },
    },
    privacy: 'Мы не храним историю и содержимое вашего трафика.',
  },
  home: {
    greeting: 'Готовы подключиться?',
    balance: 'Ваше время',
    minutes: 'мин',
    connect: 'Подключиться',
    watchAd: 'Смотреть рекламу +{{minutes}} мин',
    selectServer: 'Выбрать сервер',
    statusDisconnected: 'Отключено',
    comingSoon: 'Скоро',
    loadingAd: 'Загрузка рекламы…',
    verifying: 'Начисляем минуты…',
    adError: 'Не удалось загрузить рекламу. Попробуйте ещё раз.',
  },
  settings: {
    lowEndMode: 'Эконом-режим',
    lowEndModeHint:
      'Меньше анимаций и обновлений — для слабых телефонов и нестабильного интернета.',
  },
};

export type Translation = typeof ru;
