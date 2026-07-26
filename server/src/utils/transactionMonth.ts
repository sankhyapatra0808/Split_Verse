const transactionMonthAliases = new Map<string, number>([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);

export function parseTransactionMonth(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const numericMonth = Number(normalized);

  if (
    Number.isInteger(numericMonth) &&
    numericMonth >= 1 &&
    numericMonth <= 12
  ) {
    return numericMonth;
  }

  return transactionMonthAliases.get(normalized) ?? null;
}

export function isValidTransactionMonthInput(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length === 0 || parseTransactionMonth(normalized) !== null;
}
