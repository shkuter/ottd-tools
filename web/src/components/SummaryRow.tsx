import { Table } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * One line of a summary table: a label on the left, the figure on the right.
 *
 * The panels of the route tab are built from these, and they were each carrying their own
 * copy of it — the same four lines in two files.
 */
export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td>{label}</Table.Td>
      <Table.Td className="cell-num">{children}</Table.Td>
    </Table.Tr>
  );
}
