// utils/Logger.js
// Универсальный логгер

export default class Logger {
    constructor(prefix = '[SUNO]', options = {}) {
        this.prefix = prefix;
        this.level = options.level || 'info';
        this.colors = {
            reset: '\x1b[0m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            gray: '\x1b[90m'
        };
    }

    _formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const levelMap = {
            'error': this.colors.red + 'ERROR' + this.colors.reset,
            'warn': this.colors.yellow + 'WARN' + this.colors.reset,
            'info': this.colors.green + 'INFO' + this.colors.reset,
            'debug': this.colors.cyan + 'DEBUG' + this.colors.reset,
            'trace': this.colors.gray + 'TRACE' + this.colors.reset
        };
        const levelColor = levelMap[level] || level.toUpperCase();
        return `${this.colors.gray}[${timestamp}]${this.colors.reset} ${this.prefix} ${levelColor}: ${message}`;
    }

    error(message, ...args) {
        console.error(this._formatMessage('error', message), ...args);
    }

    warn(message, ...args) {
        console.warn(this._formatMessage('warn', message), ...args);
    }

    log(message, ...args) {
        console.log(this._formatMessage('info', message), ...args);
    }

    info(message, ...args) {
        console.info(this._formatMessage('info', message), ...args);
    }

    debug(message, ...args) {
        if (this.level === 'debug' || this.level === 'trace') {
            console.debug(this._formatMessage('debug', message), ...args);
        }
    }

    trace(message, ...args) {
        if (this.level === 'trace') {
            console.trace(this._formatMessage('trace', message), ...args);
        }
    }

    /**
     * Создать дочерний логгер с другим префиксом
     */
    child(prefix) {
        return new Logger(prefix, { level: this.level });
    }
}