import { Paper, Table, Text, Title } from '@mantine/core';
import { t } from '../../i18n';
import { percent } from '../../components/format';
import { Money } from '../../components/Money';
import { SummaryRow as Row } from '../../components/SummaryRow';
import type { RouteWithFlowParams } from '../../engine/trip';
import { costliestLine, networkActions } from './actions';
import { lineName, useCorridor, useMaintenance, useSignals } from './figures';
import { panelHref } from './panels';

/**
 * The year's cost of owning the network, and what to do about it.
 *
 * The summary computes nothing: it reads the same figures the panels below state — through
 * the same hooks they use — and only ranks them. The list holds savings, so an answer that is
 * not one (a conversion that loses money, a line signalled too sparsely) stays with the panel
 * that explains it.
 */
export function NetworkSummary({ route }: { route: RouteWithFlowParams | null }) {
  const { options, result: upkeep } = useMaintenance();
  const corridor = useCorridor(route);
  const signals = useSignals(route);

  const actions = networkActions(upkeep, corridor.result, signals, corridor.targetName);
  const costliest = costliestLine(upkeep);

  // a count nobody stated is not a count of none (ADR-0004): what decides whether there is an
  // answer to show is the counts, not the money — a game with upkeep switched off owns just
  // as much network, and the panel below says so in those words
  const counted = upkeep.lines.length > 0;

  /*
   * Why the list is empty. A panel that could not compute at all (no trip, no target track,
   * no counts) has not said there is nothing to trim — it has said it cannot answer yet, and
   * the summary repeats that rather than promising the network is already lean.
   */
  const pending = !route || corridor.result === null || signals === null;

  return (
    <Paper component="section" p="sm">
      <Title order={3}>{t('networkPage.summaryTitle')}</Title>
      {counted ? (
        <>
          <Table className="summary-table stats-wide" withRowBorders={false}>
            <Table.Tbody>
              <Row label={t('networkPage.upkeepTotal')}>
                <Money value={upkeep.yearly} />
              </Row>
            </Table.Tbody>
          </Table>
          {costliest && (
            <Text className="hint">
              {t('networkPage.costliest', {
                line: lineName(costliest.line, options),
                share: percent(costliest.share),
              })}
            </Text>
          )}
        </>
      ) : (
        <Text className="hint">{t('networkPage.needCounts')}</Text>
      )}

      <Title order={4}>{t('networkPage.trimTitle')}</Title>
      {actions.length > 0 && (
        <Table className="summary-table stats-wide" withRowBorders={false}>
          <Table.Tbody>
            {actions.map((action) => (
              <Table.Tr key={action.panel}>
                <Table.Td>
                  <a href={panelHref(action.panel)}>{action.label}</a>
                </Table.Td>
                <Table.Td className="cell-num">
                  <Money value={action.yearly} />
                  {upkeep.yearly > 0 && (
                    <Text component="span" className="hint">
                      {' '}
                      {t('networkPage.actionShare', { share: percent(action.share) })}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {/* see `pending` above: an unanswered panel is said so even beside a saving */}
      {(pending || actions.length === 0) && (
        <Text className="hint">
          {!route
            ? t('networkPage.trimNeedsRoute')
            : pending
              ? t('networkPage.trimIncomplete')
              : t('networkPage.nothingToTrim')}
        </Text>
      )}
    </Paper>
  );
}
