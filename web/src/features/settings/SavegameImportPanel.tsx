import { useState } from 'react';
import { Button, Group, Table, Text } from '@mantine/core';
import { economies, economyById } from '../../dataset';
import { t } from '../../i18n';
import { useSettingsStore } from '../../state/settingsStore';
import { useFirsStore } from '../../state/firsStore';
import { diffImport, type ImportDiff } from '../../savegame/diff';
import type { SavegameImport } from '../../savegame/import';

type State =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; proposal: SavegameImport; diff: ImportDiff };

function economyName(id: string): string {
  return economyById.get(id)?.name ?? economies[0]?.name ?? id;
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
  const economyId = useFirsStore((s) => s.economyId);

  async function readFile(file: File) {
    setState({ phase: 'reading' });
    // the reader, the xz decoder and the chunk walker all live behind this import
    const savegame = await import('../../savegame/client');
    try {
      const proposal = await savegame.importSavegame(file);
      const diff = diffImport(proposal, game, calc, economyId, economyName);
      setState({ phase: 'ready', proposal, diff });
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

  async function apply(proposal: SavegameImport) {
    const { applyImport } = await import('../../savegame/apply');
    applyImport(proposal);
    setState({ phase: 'idle' });
  }

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
          onApply={() => void apply(state.proposal)}
          onCancel={() => setState({ phase: 'idle' })}
        />
      )}
    </div>
  );
}

function SavegameDiff({
  diff,
  onApply,
  onCancel,
}: {
  diff: ImportDiff;
  onApply: () => void;
  onCancel: () => void;
}) {
  const changes = [...diff.game, ...diff.calc, ...(diff.economy ? [diff.economy] : [])];
  return (
    <div className="savegame-diff">
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

      <Group gap="xs">
        {!diff.identical && <Button onClick={onApply}>{t('savegame.apply')}</Button>}
        <Button variant="default" onClick={onCancel}>
          {diff.identical ? t('savegame.close') : t('savegame.cancel')}
        </Button>
      </Group>
    </div>
  );
}
