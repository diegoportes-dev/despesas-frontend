import type { ExpenseDraft } from './types';

// Retorna um rascunho de despesa vazio e limpo com as propriedades conhecidas
export const emptyDraft = (): ExpenseDraft => ({
  dataDespesa: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
  descricaoDespesa: '',
  valorDespesa: '',
  modalidadePagamento: '',
  categoriaDespesa: '',
});

/**
 * Função utilitária para mesclar os dados vindos da IA do seu servidor 
 * garantindo que respeitem o tipo ExpenseDraft.
 */
export function formatOcrResponse(serverDraft: Partial<ExpenseDraft>): ExpenseDraft {
  const base = emptyDraft();
  return {
    ...base,
    ...serverDraft,
  };
}
