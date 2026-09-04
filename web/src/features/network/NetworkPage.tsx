import { NavLink } from 'react-router';
import { Paper, Text, Title } from '@mantine/core';
import { t } from '../../i18n';
import { cargoName } from '../../i18n/names';
import { num } from '../../components/format';
import { useRouteParams } from '../route/useRouteParams';
import { NetworkSummary } from './NetworkSummary';
import { NetworkMaintenance } from './NetworkMaintenance';
import { CorridorUpgrade } from './CorridorUpgrade';
import { SignalDensity } from './SignalDensity';

/**
 * What the network costs to own, and what to trim.
 *
 * The trip is not entered here: the corridor and signal panels compute from the consist and
 * the distance stated on the route income tab, and a second set of fields for them would be a
 * second answer about the same line. The tab states the trip it borrowed instead, and links
 * to where it is entered.
 */
export default function NetworkPage() {
  const { cargo, entries, routeParams } = useRouteParams();
  // the consist as the builder holds it: what pulls it, and how many vehicles were added
  // there — not the engine's parts, which is what the physics counts
  const vehicles = entries.reduce((count, entry) => count + entry.count, 0);
  const engine = entries.find((entry) => entry.train.kind === 'engine')?.train ?? null;
  const consist = engine
    ? t('networkPage.consistWithEngine', { engine: engine.name, vehicles: num(vehicles) })
    : t('networkPage.consistVehicles', { vehicles: num(vehicles) });

  return (
    <>
      <Title order={2}>{t('networkPage.title')}</Title>
      <div className="page-network">
        <NetworkSummary route={routeParams} />

        <Paper component="section" p="sm">
          <Text>
            {routeParams && cargo
              ? t('networkPage.routeSummary', {
                  cargo: cargoName(cargo),
                  distance: num(routeParams.distanceTiles),
                  tiles: t('units.tiles'),
                  consist,
                })
              : t('networkPage.needRoute')}{' '}
            <NavLink to="/income">{t('nav.income')}</NavLink>
          </Text>
        </Paper>

        <NetworkMaintenance />

        <CorridorUpgrade route={routeParams} />

        <SignalDensity route={routeParams} />
      </div>
    </>
  );
}
