export type Expense = {
  id: string;
  dataDespesa: string;
  descricaoDespesa: string;
  valorDespesa: number;
  modalidadePagamento: string;
  categoriaDespesa: string;
  ativo: string;
  created: string;
};

export type ExpenseInput = {
  dataDespesa: string;
  descricaoDespesa: string;
  valorDespesa: number;
  modalidadePagamento: string;
  categoriaDespesa: string;
};

export type ExpenseCollection = {
  data: Expense[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  links: Array<{ rel: string; href: string; method: string }>;
};

export type ExpenseDraft = {
  dataDespesa: string;
  descricaoDespesa: string;
  valorDespesa: string;
  modalidadePagamento: string;
  categoriaDespesa: string;
};