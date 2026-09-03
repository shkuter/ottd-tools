import { Group, Paper, Text } from '@mantine/core';
import { useNavigate } from 'react-router';
import { num } from '../../components/format';
import { t } from '../../i18n';
import type { SnapshotCompany } from '../../savegame/snapshot';
import type { NetworkInputs } from '../../state/routeStore';
import { applyNetworkBridge } from './applyBridge';
import { BridgeButton } from './BridgeButton';
import { companyToNetwork } from './bridge';
import { companyLabel } from './labels';

/**
 * What the selected company owns, and the way into pricing it: the counts the game's own
 * infrastructure window shows, carried over to the network upkeep block of Route income.
 *
 * Only the rail side is shown. Roads, trams and canals are counted too — the yearly total has
 * to be checkable against the game's window — but a rail calculator has no fields for them,
 * and listing figures the block will not take would promise more than the bridge carries.
 */
export function CompanyNetworkCard({ company }: { company: SnapshotCompany }) {
  const navigate = useNavigate();
  const bridge = companyToNetwork(company);

  return (
    <Paper component="section" className="game-network" p="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text>{t('game.network')}</Text>
        <Text className="hint">
          {bridge.values ? summary(bridge.values) : t(`game.blocker.${bridge.blocker}`)}
        </Text>
        <BridgeButton
          action={t('game.toNetwork')}
          bridge={bridge}
          onTake={(values) => {
            applyNetworkBridge(values, companyLabel(company));
            void navigate('/income');
          }}
        />
      </Group>
    </Paper>
  );
}

/** The one line the card states: the whole rail network, its signals and its station tiles. */
function summary(network: NetworkInputs): string {
  return t('game.networkSummary', {
    track: num(Object.values(network.railPieces).reduce((sum, pieces) => sum + pieces, 0)),
    // the unit is named rather than written into the sentence: a piece is not a tile, and the
    // word for it lives in one place (CONTEXT.md, "Track piece")
    trackUnit: t('units.trackPieces'),
    signals: num(network.signals),
    stations: num(network.stations),
  });
}
