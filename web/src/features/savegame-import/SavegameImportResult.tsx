import { Fragment } from 'react';
import { Button, Group, Table, Text } from '@mantine/core';
import { t } from '../../i18n';
import type { ImportDiff } from '../../savegame/diff';
import type { Snapshot } from '../../savegame/snapshot';
import type { SavegameImport } from './useSavegameImport';

/** "92 trains, 55 routes, 100 stations" — what the panel says about a snapshot. */
function snapshotSummary(snapshot: Snapshot): string {
  return t('savegame.snapshotSummary', {
    trains: snapshot.trains.length,
    routes: snapshot.routes.length,
    stations: snapshot.stations.filter((s) => !s.isWaypoint).length,
  });
}

function infoValue(kind: string, value: number, choiceKeys?: readonly string[]): string {
  if (kind === 'flag') return t(value ? 'settings.on' : 'settings.off');
  if (kind === 'percent') return `${value}%`;
  if (kind === 'choice') {
    const key = choiceKeys?.[value];
    return key ? t(key) : String(value);
  }
  return String(value);
}

/**
 * What an import has to show for itself: the reason it failed, the differences waiting for a
 * confirmation, or the summary of the snapshot it stored. The same thing whether it is read
 * on the settings screen or in the window over another page.
 */
export function SavegameImportResult({
  state,
  apply,
  reset,
  onClose,
}: Pick<SavegameImport, 'state' | 'apply' | 'reset'> & {
  /** how the reader gets rid of what is shown, where it stands over the page */
  onClose?: () => void;
}) {
  return (
    <>
      {state.phase === 'error' && <Text className="savegame-error">{state.message}</Text>}

      {state.phase === 'ready' && (
        <SavegameDiff
          diff={state.diff}
          summary={snapshotSummary(state.result.snapshot)}
          onApply={() => void apply(state.result)}
          onCancel={reset}
        />
      )}

      {/* applying does not take the summary away: the settings change silently, and it is
          the only thing saying that anything happened. Where it stands over a page, it is
          the reader who dismisses it */}
      {state.phase === 'saved' && (
        <>
          <Text className="savegame-saved">
            {t('savegame.snapshotSaved', { summary: snapshotSummary(state.snapshot) })}
          </Text>
          {onClose && <Button onClick={onClose}>{t('savegame.close')}</Button>}
        </>
      )}
    </>
  );
}

function SavegameDiff({
  diff,
  summary,
  onApply,
  onCancel,
}: {
  diff: ImportDiff;
  summary: string;
  onApply: () => void;
  onCancel: () => void;
}) {
  /*
   * Grouped the way the settings screen groups them, and named with its own headings: the
   * display settings change what the figures look like, not what they are, and a flat list
   * would offer them as if they moved the calculation like the rest.
   */
  const groups = [
    { labelKey: 'settings.game', changes: diff.game },
    { labelKey: 'settings.calc', changes: diff.calc },
    { labelKey: 'settings.display', changes: diff.display },
  ].filter((group) => group.changes.length > 0);
  return (
    <div className="savegame-diff">
      {/* what the calculator recognised the game as, before what it proposes to change:
          the roster is concluded from these, so the conclusion is shown with its grounds */}
      {diff.recognisedSets.length > 0 && (
        <Text className="savegame-recognised">
          {t('savegame.recognisedSets', {
            sets: diff.recognisedSets.map((key) => t(key)).join(', '),
          })}
        </Text>
      )}
      {diff.identical ? (
        <Text>{t('savegame.identical')}</Text>
      ) : (
        <>
          <h4>{t('savegame.diffTitle')}</h4>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('savegame.setting')}</Table.Th>
                <Table.Th>{t('savegame.current')}</Table.Th>
                <Table.Th>{t('savegame.incoming')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groups.map((group) => (
                <Fragment key={group.labelKey}>
                  <Table.Tr className="savegame-diff-group">
                    <Table.Th colSpan={3}>{t(group.labelKey)}</Table.Th>
                  </Table.Tr>
                  {group.changes.map((change) => (
                    <Table.Tr key={change.label}>
                      <Table.Td>{change.label}</Table.Td>
                      <Table.Td>{change.current}</Table.Td>
                      <Table.Td>{change.incoming}</Table.Td>
                    </Table.Tr>
                  ))}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      {(diff.info.length > 0 || diff.unreadBaseCostSets.length > 0 || diff.inflation) && (
        <div className="savegame-info">
          <h4>{t('savegame.infoTitle')}</h4>
          <p className="hint">{t('savegame.infoHint')}</p>
          <Table>
            <Table.Tbody>
              {diff.inflation && (
                <Table.Tr>
                  <Table.Td>{t('savegame.info.inflation')}</Table.Td>
                  <Table.Td>
                    {t('savegame.info.inflationValue', {
                      prices: diff.inflation.prices.toFixed(2),
                      payment: diff.inflation.payment.toFixed(2),
                    })}
                  </Table.Td>
                </Table.Tr>
              )}
              {diff.info.map((item) => (
                <Table.Tr key={item.setting.name}>
                  <Table.Td>{t(item.setting.labelKey)}</Table.Td>
                  <Table.Td>
                    {infoValue(item.setting.kind, item.value, item.setting.choiceKeys)}
                  </Table.Td>
                </Table.Tr>
              ))}
              {diff.unreadBaseCostSets.map((labelKey) => (
                <Table.Tr key={labelKey}>
                  <Table.Td>{t(labelKey)}</Table.Td>
                  <Table.Td>{t('savegame.info.parametersUnknown')}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      <p className="hint">{summary}</p>

      <Group gap="xs" className="window-actions">
        {/* the confirmation stores the snapshot even when the settings already match */}
        <Button onClick={onApply}>
          {diff.identical ? t('savegame.applySnapshotOnly') : t('savegame.apply')}
        </Button>
        <Button variant="default" onClick={onCancel}>
          {t('savegame.cancel')}
        </Button>
      </Group>
    </div>
  );
}
