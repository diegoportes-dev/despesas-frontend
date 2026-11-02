import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Expense, ExpenseCollection, ExpenseDraft, ExpenseInput } from './types';

// const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:5164').replace(/\/$/, '');
// const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.0.4:5164').replace(/\/$/, '');
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.0.5:5164').replace(/\/$/, '');
const tokenKey = 'despesas.jwt';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    console.log(`Requesting ${apiUrl}${path}`);
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Confira o endereço e a rede.', 0);
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const validationErrors = body?.errors;
    const message = typeof body?.message === 'string'
      ? body.message
      : response.status === 401
        ? 'E-mail ou senha inválidos.'
        : 'Não foi possível concluir a operação.';
    const detail = validationErrors && typeof validationErrors === 'object'
      ? Object.values(validationErrors).flat().join(' ')
      : '';
    throw new ApiError(detail ? `${message} ${detail}` : message, response.status);
  }

  return body as T;
}

export async function signIn(email: string, senha: string): Promise<string> {
  const result = await request<{ token: string }>('/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
  await SecureStore.setItemAsync(tokenKey, result.token);
  return result.token;
}

export const readSavedToken = () => SecureStore.getItemAsync(tokenKey);
export const clearSavedToken = () => SecureStore.deleteItemAsync(tokenKey);

export async function listExpenses(token: string, selectedMonth: Date): Promise<ExpenseCollection> {
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;
  const query = `year=${year}&month=${month}`;
  const firstPage = await request<ExpenseCollection>(`/despesas?page=1&pageSize=100&${query}`, token);
  const remainingPages: ExpenseCollection[] = [];

  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    remainingPages.push(
      await request<ExpenseCollection>(`/despesas?page=${page}&pageSize=100&${query}`, token),
    );
  }

  return {
    ...firstPage,
    data: [firstPage, ...remainingPages].flatMap(result => result.data),
  };
}

export function getExpense(token: string, id: string): Promise<{ data: Expense }> {
  return request(`/despesas/${id}`, token);
}

export function createExpense(token: string, expense: ExpenseInput): Promise<{ data: Expense }> {
  return request('/despesas', token, { method: 'POST', body: JSON.stringify(expense) });
}

export function updateExpense(token: string, id: string, expense: ExpenseInput): Promise<{ data: Expense }> {
  return request(`/despesas/${id}`, token, { method: 'PUT', body: JSON.stringify(expense) });
}

export function patchExpense(token: string, id: string, changes: Partial<ExpenseInput>): Promise<{ data: Expense }> {
  return request(`/despesas/${id}`, token, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function deleteExpense(token: string, id: string): Promise<void> {
  return request(`/despesas/${id}`, token, { method: 'DELETE' });
}

export async function analyzeReceipt(imageUri: string): Promise<{ draft: ExpenseDraft }> {
  const formData = new FormData();
  formData.append('receipt', {
    uri: Platform.OS === 'ios' ? imageUri.replace('file://', '') : imageUri,
    type: 'image/jpeg',
    name: 'receipt.jpg',
  } as any);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/despesas/analisar-comprovante`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Confira o endereço e a rede.', 0);
  }

  const body = await response.json().catch(() => null) as {
    draft?: ExpenseDraft;
    message?: string;
    detail?: string;
    title?: string;
  } | null;

  if (!response.ok) {
    throw new ApiError(
      body?.message ?? body?.detail ?? body?.title ?? 'Não foi possível analisar o comprovante.',
      response.status,
    );
  }

  if (!body?.draft) {
    throw new ApiError('A resposta da análise não contém um rascunho de despesa.', response.status);
  }

  return { draft: body.draft };
}

export function shouldSignOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}