# старая проектная система
``` text
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
```
#новая модульная система
```
SUNO_MPC/
├── core/                      # Ядро системы (основная логика)
│   ├── index.js               # Главная точка входа
│   ├── State.js               # Глобальное состояние
│   ├── CfgMgr.js              # Управление конфигурацией
│   └── LifeCycle.js           # Жизненный цикл (запуск/остановка)
│
├── src/                       # Модули управления
│   ├── BrowserManager.js.     # УпрMIDIавление браузером (Puppeteer)
│   ├── DeviceRouter.js        # Маршрутизация MIDI-командCfgMgr
│   ├── FeedbackLoop.js        # Обратная связь (GUI → MIDI)
│   ├── GUIManager.js          # Управление GUI (клики, обновление)
│   └── MIDIenv/               # MIDI-часть
│       ├── DevScan.js         # Сканирование устройств
│       ├── PrtclScan.js       # Сканирование протоколов
│       ├── PortScan.js        # Сканирование MIDI-портов
│       └── DevTemplate.js     # Шаблон для новых устройств
│
├── protocols/                 # Реализации протоколов
│   ├── abstract.js            # Абстрактные команды
│   ├── hui.js                 # HUI протокол
│   ├── mcu.js                 # MCU протокол
│   └── Ptemplate.js           # Шаблон для новых протоколов
│   
├── map/                       # Описания устройств
│   ├── ssl-nucleus-2.js       # SSL Nucleus 2
│   ├── mackie-control.js      # Mackie Control
│   └── LX25plus-control.js    # Impact LX25+ Control
│
├── config/                    # Конфигурация
│   ├── selectors_v1.json      # Селекторы DOM для Suno 1.2
│   ├── selectors_v2.json      # Селекторы DOM для Suno 2.0
│   └── Default_Cfg.json       # autosave конфигурация
│
├── utils/                     # Вспомогательные модули
│   ├── menu.js                # Inquirer меню
│   ├── commands.js            # Консольные команды
│   ├── Logger.js              # Универсальный логгер
│   ├── studio_v1.test.js      # Тесты для Suno Studio ver.1.2
│   └── studio_v2.test.js      # Тесты для Suno Studio ver.2.0
│
├── package.json
└── README.md
```