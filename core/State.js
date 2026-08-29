// core/State.js
// Глобальное состояние приложения

export const appState = {
    isRunning: false,
    browser: null,
    page: null,
    deviceRouter: null,
    guiManager: null,
    feedbackLoop: null,
    config: null,
    selectedDevice: null,
    selectedProtocol: null,
    consoleCleanup: null,
    shutdown: null
};

export function updateState(key, value) {
    if (key in appState) {
        appState[key] = value;
        return true;
    }
    return false;
}

export function getState(key) {
    return key ? appState[key] : appState;
}

export function resetState() {
    Object.keys(appState).forEach(k => {
        if (k !== 'shutdown' && k !== 'consoleCleanup') {
            appState[k] = null;
        }
    });
    appState.isRunning = false;
}
/*
export function resetState() {
    appState.isRunning = false;
    appState.browser = null;
    appState.page = null;
    appState.deviceRouter = null;
    appState.guiManager = null;
    appState.feedbackLoop = null;
    appState.config = null;
    appState.selectedDevice = null;
    appState.selectedProtocol = null;
}
*/