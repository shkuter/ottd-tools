import { money } from './format';

/** Денежная сумма; отрицательная — красным. */
export function Money({ value }: { value: number }) {
  return <span className={value < 0 ? 'money-neg' : undefined}>{money(value)}</span>;
}
