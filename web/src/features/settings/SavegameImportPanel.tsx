import { useState, useSyncExternalStore } from 'react';
import { Button, Group, Table, Text } from '@mantine/core';
import { t } from '../../i18n';
import { useSettingsStore } from '../../state/settingsStore';
import { diffImport, type ImportDiff } from '../../savegame/diff';
import type { ConfirmedImport } from '../../savegame/apply';
import { getSnapshotState, subscribeSnapshot } from '../../savegame/snapshotStore';
import type { Snapshot } from '../../savegame/snapshot';

type State =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; result: ConfirmedImport; diff: ImportDiff }
  | { phase: 'saved'; snapshot: Snapshot };

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
 * Loading a savegame never changes anything on its own: the file is read, the differences
 * are listed, and only a confirmation applies them.
 */
export function SavegameImportPanel() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const { game, calc } = useSettingsStore();

  async function readFile(file: File) {
    setState({ phase: 'reading' });
    // the reader, the xz decoder and the chunk walker all live behind this import
    const savegame = await import('../../savegame/client');
    try {
      const result = await savegame.importSavegame(file);
      const diff = diffImport(result.proposal, game, calc);
      setState({ phase: 'ready', result, diff });
    } catch (error) {
      setState({
        phase: 'error',
        message:
          error instanceof savegame.SavegameImportError
            ? t(error.messageKey, error.params)
            : t('savegame.error.broken'),
      });
    }
  }

  async function apply(result: ConfirmedImport) {
    const { applyImport } = await import('../../savegame/apply');
    await applyImport(result, Date.now());
    setState({ phase: 'saved', snapshot: result.snapshot });
  }

  const stored = useSyncExternalStore(subscribeSnapshot, getSnapshotState);

  return (
    <div className="savegame-import">
      <p className="hint">{t('savegame.intro')}</p>
      <Group gap="xs">
        <Button
          component="label"
          disabled={state.phase === 'reading'}
          variant="default"
        >
          {state.phase === 'reading' ? t('savegame.reading') : t('savegame.choose')}
          <input
            type="file"
            accept=".sav"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void readFile(file);
            }}
          />
        </Button>
      </Group>

      {state.phase === 'error' && <Text className="savegame-error">{state.message}</Text>}

      {state.phase === 'ready' && (
        <SavegameDiff
          diff={state.diff}
          summary={snapshotSummary(state.result.snapshot)}
          onApply={() => void apply(state.result)}
          onCancel={() => setState({ phase: 'idle' })}
        />
      )}

      {state.phase === 'saved' && (
        <Text className="savegame-saved">
          {t('savegame.snapshotSaved', { summary: snapshotSummary(state.snapshot) })}
        </Text>
      )}

      {state.phase === 'idle' && stored.droppedOutdated && (
        <Text className="savegame-error">{t('savegame.snapshotOutdated')}</Text>
      )}
    </div>
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
  const changes = [...diff.game, ...diff.calc];
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
              {changes.map((change) => (
                <Table.Tr key={change.label}>
                  <Table.Td>{change.label}</Table.Td>
                  <Table.Td>{change.current}</Table.Td>
                  <Table.Td>{change.incoming}</Table.Td>
                </Table.Tr>
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

      <Group gap="xs">
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
