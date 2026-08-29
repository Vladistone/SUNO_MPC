// utils/Logger.js
// Универсальный логгер

export default class Logger {
    constructor(prefix = '[SUNO]') {
        this.prefix = prefix;
        this.colors = {
            reset: '\x1b[0m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            cyan: '\x1b[36m',
            gray: '\x1b[90m'
        };
    }

    log(message, ...args) {
        console.log(`${this.colors.gray}[${new Date().toISOString().slice(11, 19)}]${this.colors.reset} ${this.prefix} ${message}`, ...args);
    }
    error(message, ...args) {
        console.error(`${this.prefix} ${this.colors.red}ERROR${this.colors.reset}: ${message}`, ...args);
    }
    warn(message, ...args) {
        console.warn(`${this.prefix} ${this.colors.yellow}WARN${this.colors.reset}: ${message}`, ...args);
    }
    debug(message, ...args) {
        console.debug(`${this.prefix} ${this.colors.cyan}DEBUG${this.colors.reset}: ${message}`, ...args);
    }
}