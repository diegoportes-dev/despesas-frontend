import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { ExpenseDraft } from './types';

const emptyDraft = (): ExpenseDraft => ({
  dataDespesa: formatLocalDate(new Date()),
  descricaoDespesa: '',
  valorDespesa: '',
  modalidadePagamento: '',
  categoriaDespesa: '',
});

export async function readReceipt(imageUri: string): Promise<{ draft: ExpenseDraft; text: string }> {
  const result = await TextRecognition.recognize(imageUri);
  const text = result.text;
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const draft = emptyDraft();

  const amount = findAmount(text);
  if (amount !== null) draft.valorDespesa = amount.toFixed(2).replace('.', ',');

  const dateMatch = text.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dateMatch) {
    const fallbackTime = draft.dataDespesa.slice(-8);
    draft.dataDespesa = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]} ${dateMatch[4] ?? fallbackTime.slice(0, 2)}:${dateMatch[5] ?? fallbackTime.slice(3, 5)}:${dateMatch[6] ?? fallbackTime.slice(6, 8)}`;
  }

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const merchant = lines.find(line =>
    line.length >= 3 && line.length <= 64 && !/\d{4,}/.test(line) &&
    !/\b(cnpj|cpf|nota|cupom|total|valor|data|hora|endereco|telefone|documento)\b/i.test(
      line.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    ),
  );
  if (merchant) draft.descricaoDespesa = merchant.slice(0, 64);

  if (/\bpix\b/.test(normalized)) draft.modalidadePagamento = 'PIX';
  else if (/debito|debit/.test(normalized)) draft.modalidadePagamento = 'Cartão de débito';
  else if (/credito|credit/.test(normalized)) draft.modalidadePagamento = 'Cartão de crédito';
  else if (/dinheiro|especie/.test(normalized)) draft.modalidadePagamento = 'Dinheiro';

  if (/restaurante|lanchonete|alimentacao|refeicao|supermercado|mercado/.test(normalized)) {
    draft.categoriaDespesa = 'Alimentação';
  } else if (/combustivel|gasolina|posto/.test(normalized)) {
    draft.categoriaDespesa = 'Transporte';
  } else if (/farmacia|drogaria|medicamento/.test(normalized)) {
    draft.categoriaDespesa = 'Saúde';
  }

  return { draft, text };
}

export function formatLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function findAmount(text: string): number | null {
  const candidates = [...text.matchAll(/(?:R\$\s*)?\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\b/g)]
    .map(match => ({
      value: Number(match[1].includes(',') ? match[1].replace(/\./g, '').replace(',', '.') : match[1]),
      index: match.index ?? 0,
    }));
  if (!candidates.length) return null;

  const totalIndex = text.search(/\b(total|valor a pagar|valor pago)\b/i);
  const totalCandidate = totalIndex < 0 ? undefined : candidates.find(candidate => candidate.index >= totalIndex);
  return (totalCandidate ?? candidates[candidates.length - 1]).value;
}