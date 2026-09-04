import { NumberInput, Paper, Table, Text, Title } from '@mantine/core';
import { t } from '../../i18n';
import { num, unitSuffix } from '../../components/format';
import { PrefillNote } from '../../components/PrefillNote';
import { Money } from '../../components/Money';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';
import { lineName, useMaintenance } from './figures';
import { NETWORK_ANCHORS } from './panels';

/**
 * What the network costs to own for a year, the way the game's infrastructure window puts
 * it: a line per thing owned, and the total under them.
 *
 * Only the rail side is asked for. Roads, trams and canals are priced by the engine — the
 * total has to be checkable against the game's own window — but a rail calculator does not
 * ask the player to keep count of them.
 */
export function NetworkMaintenance() {
  const game = useSettingsStore((s) => s.game);
  const network = useRouteStore((s) => s.network);
  const setNetwork = useRouteStore((s) => s.setNetwork);
  const setRailPieces = useRouteStore((s) => s.setRailPieces);
  const networkOrigin = useRouteStore((s) => s.networkOrigin);
  // the same computation the summary above ranks, so the two cannot state different totals
  const { options, result } = useMaintenance();

  return (
    <Paper component="section" id={NETWORK_ANCHORS.maintenance} p="sm">
      <Title order={3}>{t('network.title')}</Title>
      {/* the note belongs to the counts, so it stands here rather than over the route's own
          inputs, which a company card says nothing about */}
      <PrefillNote origin={networkOrigin} current={{ network }} />
      {!game.infrastructureMaintenance && <Text className="hint">{t('network.disabled')}</Text>}
      <div className="network-inputs">
        {options.map(({ railtype, name }) => (
          <NumberInput
            key={railtype.label}
            className="field"
            label={name}
            suffix={unitSuffix(t('units.trackPieces'))}
            min={0}
            allowDecimal={false}
            // empty rather than a zero nobody typed: a count not stated is not a count of none
            value={network.railPieces[railtype.label] || ''}
            onChange={(v) => setRailPieces(railtype.label, Math.max(0, Number(v) || 0))}
          />
        ))}
        <NumberInput
          className="field"
          label={t('network.signals')}
          min={0}
          allowDecimal={false}
          value={network.signals || ''}
          onChange={(v) => setNetwork({ ...network, signals: Math.max(0, Number(v) || 0) })}
        />
        <NumberInput
          className="field"
          label={t('network.stations')}
          min={0}
          allowDecimal={false}
          value={network.stations || ''}
          onChange={(v) => setNetwork({ ...network, stations: Math.max(0, Number(v) || 0) })}
        />
      </div>
      <Table className="summary-table stats-wide" withRowBorders={false}>
        <Table.Tbody>
          {result.lines.map((line) => (
            <Table.Tr key={`${line.category}:${line.label ?? ''}`}>
              <Table.Td>
                {lineName(line, options)} · {num(line.count)}
              </Table.Td>
              <Table.Td className="cell-num">
                <Money value={line.yearly} />
              </Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td>{t('network.total')}</Table.Td>
            <Table.Td className="cell-num big">
              <Money value={result.yearly} />
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      <Text className="hint">{t('network.hint')}</Text>
    </Paper>
  );
}
