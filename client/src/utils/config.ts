const DEFAULT_SERVER_URL = 'http://localhost:5000';

const rawServerUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
export const SERVER_URL = (rawServerUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');

const explicitWsUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
export const WS_URL = explicitWsUrl || `${SERVER_URL.replace(/^http/i, 'ws')}/ws`;
