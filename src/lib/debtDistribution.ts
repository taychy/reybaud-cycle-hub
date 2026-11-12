export interface DebtDistributionRow {
  key: string;
  amount: string;
  maximum: number;
}

export interface DebtDistributionSummary {
  alreadyUsed: number;
  allocated: number;
  remaining: number;
  valid: boolean;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function summarizeDebtDistribution(
  gross: number,
  available: number,
  rows: DebtDistributionRow[],
): DebtDistributionSummary {
  const allocated = roundMoney(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
  const remaining = roundMoney(available - allocated);
  const hasRows = rows.length > 0;
  const amountsValid = rows.every((row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) && amount > 0 && amount <= row.maximum + 0.01;
  });

  return {
    alreadyUsed: roundMoney(Math.max(0, gross - available)),
    allocated,
    remaining,
    valid: hasRows && amountsValid && allocated > 0 && remaining >= -0.01,
  };
}
