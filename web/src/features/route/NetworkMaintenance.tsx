import { NumberInput, Paper, Table, Text, Title } from '@mantine/core';
import { selectableRailtypes } from '../../dataset';
import { t } from '../../i18n';
import { railtypeOptions } from '../../i18n/names';
import { num, unitSuffix } from '../../components/format';
import { PrefillNote } from '../../components/PrefillNote';
import { Money } from '../../components/Money';
import {
  EMPTY_NETWORK,
  networkMaintenance,
  type MaintenanceCategory,
} from '../../engine/infrastructure';
import { useRouteStore } from '../../state/routeStore';
import { useSettingsStore } from '../../state/settingsStore';

/**
 * What the network costs to own for a year, the way the game's infrastructure window puts
 * it: a line per thing owned, and the total under them.
 *
 * Only the rail side is asked for. Roads, trams and canals are priced by the engine — the
 * total has to be checkable against the game's own window — but a rail calculator does not
 * ask the player to keep count of them.
 */
export function NetworkMaintenance() {
  const { game, calc } = useSettingsStore();
  const network = useRouteStore((s) => s.network);
  const setNetwork = useRouteStore((s) => s.setNetwork);
  const setRailPieces = useRouteStore((s) => s.setRailPieces);
  const networkOrigin = useRouteStore((s) => s.networkOrigin);
  // named through railtypeOptions: a set may call two tracks the same thing, and a column of
  // identical labels would be two fields nobody can tell apart. Not memoised — the names are
  // translated, and a memo would hold the language they were first drawn in
  const options = railtypeOptions(selectableRailtypes(game));
  const railtypes = options.map((option) => option.railtype);

  // only the rail side is asked for; the rest of a network stays at nothing
  const result = networkMaintenance(
    { ...EMPTY_NETWORK, rail: network.railPieces, signals: network.signals, stations: network.stations },
    railtypes,
    game,
    calc.priceYear,
  );

  /** What a billed line is called. Only the rail side is asked for, so only it is named. */
  const lineName = (category: MaintenanceCategory, label?: string): string => {
    if (category === 'signal') return t('network.signals');
    if (category === 'station') return t('network.stations');
    return options.find((option) => option.railtype.label === label)?.name ?? label ?? '';
  };

  return (
    <Paper component="section" className="route-network" p="sm">
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
                {lineName(line.category, line.label)} · {num(line.count)}
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
