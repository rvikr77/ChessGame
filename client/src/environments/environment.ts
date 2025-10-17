export const environment = {
    WS_URL: window['env']?.WS_URL || 'ws://localhost:8080',
    API_URL: window['env']?.API_URL || 'http://localhost:8080'
};