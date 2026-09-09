import { useMemo } from 'react';
import { NavLink } from 'react-router';
import { List, Paper, Text, Title } from '@mantine/core';
import { t, useLocale } from '../../i18n';
import type { Locale } from '../../state/localeStore';
import { cargoName, industryName } from '../../i18n/names';
import { cargoByLabel } from '../../dataset';
import type { Snapshot } from '../../savegame/snapshot';
import type { Economy } from '../../types';
import { chainCompleteness, industriesOnMap, type MapIndustry } from './completeness';

/**
 * What the map itself allows, beside the list of what to haul: which industries standing on
 * it cannot produce at all, which cargoes nobody there takes, and which supply cargoes have
 * no source. Needs an imported game and states nothing without one (ADR-0009).
 */
export function ChainCompleteness({
  economy,
  snapshot,
}: {
  economy: Economy;
  snapshot: Snapshot | null;
}) {
  const locale = useLocale();
  const result = useMemo(() => {
    if (!snapshot) return null;
    const { onMap, unknownCount } = industriesOnMap(snapshot);
    return chainCompleteness({ economy, onMap, unknownCount, locale });
  }, [economy, snapshot, locale]);

  return (
    <Paper component="section" className="firs-completeness" p="sm">
      <Title order={3}>{t('firs.completeness.title')}</Title>
      <Text className="hint">{t('firs.completeness.intro')}</Text>

      {result === null ? (
        <Text className="hint">
          {t('firs.completeness.needGame')} <NavLink to="/game">{t('nav.game')}</NavLink>
        </Text>
      ) : (
        <>
          <Section title={t('firs.completeness.gaps')} empty={result.gaps.length === 0}>
            <List>
              {result.gaps.map((gap) => (
                <List.Item key={gap.industry?.id ?? ''}>
                  {gap.industry
                    ? t('firs.completeness.build', {
                        industry: industryName(gap.industry, economy.id, locale),
                        count: gap.starts,
                      })
                    : t('firs.completeness.nothingToBuild', { count: gap.starts })}
                  <List withPadding>
                    {gap.blocked.map((row) => (
                      <List.Item key={row.industry.id}>
                        <IndustryLine row={row} economyId={economy.id} locale={locale} />
                      </List.Item>
                    ))}
                  </List>
                </List.Item>
              ))}
            </List>
          </Section>

          <Section title={t('firs.completeness.deadEnds')} empty={result.deadEnds.length === 0}>
            <List>
              {result.deadEnds.map((end) => (
                <List.Item key={end.cargoLabel}>
                  {cargoName(cargoByLabel.get(end.cargoLabel), locale)}
                  {': '}
                  <List withPadding>
                    {end.producers.map((row) => (
                      <List.Item key={row.industry.id}>
                        <IndustryLine row={row} economyId={economy.id} locale={locale} />
                      </List.Item>
                    ))}
                  </List>
                </List.Item>
              ))}
            </List>
          </Section>

          {result.missingSupplies.length > 0 && (
            <Text className="hint">
              {t('firs.completeness.supplies', {
                cargos: result.missingSupplies
                  .map((label) => cargoName(cargoByLabel.get(label), locale))
                  .join(', '),
              })}
            </Text>
          )}

          <div className="firs-completeness-notes">
            {/* the one thing the player fears about a single factory, answered once for the
                whole list rather than repeated on every row */}
            <Text className="hint">{t('firs.completeness.neverClose')}</Text>

            {result.unknownCount > 0 && (
              <Text className="hint">
                {t('firs.completeness.unknown', { count: result.unknownCount })}
              </Text>
            )}
          </div>
        </>
      )}
    </Paper>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Title order={4}>{title}</Title>
      {empty ? <Text className="hint">{t('firs.completeness.none')}</Text> : children}
    </>
  );
}

/** One industry type of the map: its name, and how many stand there. */
function IndustryLine({
  row,
  economyId,
  locale,
}: {
  row: MapIndustry;
  economyId: string;
  locale: Locale;
}) {
  return (
    <>
      {industryName(row.industry, economyId, locale)}
      {row.count > 1 && ` ×${row.count}`}
    </>
  );
}
