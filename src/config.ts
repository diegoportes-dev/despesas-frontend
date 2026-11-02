import * as SecureStore from 'expo-secure-store';

const apiUrlKey = 'despesas.apiUrl';
const defaultApiUrl = 'http://despesas.runasp.net';
const environmentApiUrl = process.env.EXPO_PUBLIC_API_URL;
let activeApiUrl = defaultApiUrl;

function normalizeApiUrl(value: string): string {
  const trimmedValue = value.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error('Informe um endereço de API válido, incluindo http:// ou https://.');
  }

  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')
    || !parsedUrl.hostname
    || parsedUrl.username
    || parsedUrl.password
    || parsedUrl.search
    || parsedUrl.hash
  ) {
    throw new Error('Use um endereço HTTP ou HTTPS válido, sem usuário, senha, parâmetros ou fragmento.');
  }

  return trimmedValue.replace(/\/+$/, '');
}

export function getApiUrl(): string {
  return activeApiUrl;
}

export async function loadApiUrl(): Promise<string> {
  const savedApiUrl = await SecureStore.getItemAsync(apiUrlKey);
  activeApiUrl = savedApiUrl ? normalizeApiUrl(savedApiUrl) : normalizeApiUrl(environmentApiUrl || defaultApiUrl);
  return activeApiUrl;
}

export async function saveApiUrl(value: string): Promise<string> {
  const normalizedApiUrl = normalizeApiUrl(value);
  await SecureStore.setItemAsync(apiUrlKey, normalizedApiUrl);
  activeApiUrl = normalizedApiUrl;
  return activeApiUrl;
}
