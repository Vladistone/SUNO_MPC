'''
SUNO_controller/
├── package.json
├── package-lock.json
├── server.js               # Главная точка входа (просто запускает модули)
├── .gitignore              # Исключения для Git (node_modules, логи)
├── config/
│   ├── selectors_v1.json   # Селекторы DOM для Suno Studio 1.0
│   └── selectors_v2.json   # Селекторы DOM для Suno Studio 2.0
│
├── src/
│   └── browser.js          # Модуль Puppeteer (подключение, управление фреймами)
│
├─── midi/
│    ├── midi-router.js  	# Главный маршрутизатор MIDI-команд
│    ├── protocol-hui.js 	# Реализация протокола HUI (для фейдеров)
│    └── device-mpc.js   	# Специфичный маппинг для ваших MPC-контроллеров
│
├── core/
│   └── bridge.js       	# Логика связи: "Движение MIDI -> Изменение в GUI"
│
├── node_modules/...		# Lib - библиатеки
│
└── tests/
    ├── studio_v1.test.js   # Тесты для проверки интерфейса 1.0
    └── studio_v2.test.js   # Тесты для проверки интерфейса 2.0
'''
