import { Title } from '@mantine/core';
import { cargoByLabel, industryById } from '../../../dataset';
import { intlLocale, t, useLocale } from '../../../i18n';
import { cargoName, industryName, sortCargos } from '../../../i18n/names';
import { CargoIcon } from '../../../components/CargoIcon';
import type { Economy } from '../../../types';

/**
 * What the graph's shapes mean, in the column the node card takes once a node is picked.
 *
 * Drawn in HTML with the skin's colours and a cargo icon, not as a copy of the canvas: the
 * game palette is allowed inside the canvas only (ADR-0008), so the badge sample says in
 * words that the canvas paints it in the cargo's colour instead of showing one. The samples
 * are examples, not data — the first cargo and the first industry of the economy by their
 * shown names; the industry sample shows what its card does: picture, name and accept mode.
 * Worded at render time, so a language switch rewords it.
 */
export function GraphLegend({ economy }: { economy: Economy }) {
  const locale = useLocale();
  const cargos = economy.cargo_labels.flatMap((label) => {
    const cargo = cargoByLabel.get(label);
    return cargo ? [cargo] : [];
  });
  const sample = sortCargos(cargos, locale)[0];
  const sampleName = sample ? cargoName(sample, locale) : '';

  const industries = economy.industry_ids.flatMap((id) => {
    const industry = industryById.get(id);
    const mode = industry?.economies[economy.id]?.accept_mode;
    return industry && mode ? [{ industry, mode, name: industryName(industry, economy.id, locale) }] : [];
  });
  const shown = industries.sort((a, b) => a.name.localeCompare(b.name, intlLocale(locale)))[0];
  const industryLabel = t('firs.legend.industrySample');

  const badge = sample && (
    <span className="graph-legend__sample graph-legend__cargo">
      <CargoIcon icon={sample.icon} /> {sampleName}
    </span>
  );

  return (
    <div className="graph-legend">
      <Title order={3}>{t('firs.legend.title')}</Title>
      <ul className="graph-legend__entries">
        <Entry text={t('firs.legend.industry')}>
          <span className="graph-legend__sample graph-legend__industry">
            {shown && (
              <img src={`${import.meta.env.BASE_URL}${shown.industry.image_small}`} alt="" draggable={false} />
            )}
            {shown?.name ?? industryLabel}
            {shown && (
              <span className="graph-legend__note graph-legend__mode">{t(`firs.industry.mode.${shown.mode}`)}</span>
            )}
          </span>
        </Entry>
        <Entry text={t('firs.legend.cargo')}>{badge}</Entry>
        <Entry text={t('firs.legend.clone')}>
          <span className="graph-legend__pair">
            <span className="graph-legend__sample graph-legend__industry">{industryLabel}</span>
            {badge}
          </span>
        </Entry>
        <Entry text={t('firs.legend.to')}>
          <span className="graph-legend__sample graph-legend__cargo">
            {sampleName}
            <span className="graph-legend__note">{t('firs.node.to', { industry: '…' })}</span>
          </span>
        </Entry>
        <Entry text={t('firs.legend.supply')}>
          <span className="graph-legend__sample graph-legend__industry">
            {industryLabel}
            <span className="graph-legend__note">{t('firs.node.requires', { cargo: sampleName })}</span>
            <span className="graph-legend__note">{t('firs.node.produces', { cargo: sampleName })}</span>
          </span>
        </Entry>
        <Entry text={t('firs.legend.edge')}>
          <svg className="graph-legend__edge" viewBox="0 0 60 12" aria-hidden="true">
            <path d="M0 6 H50" />
            <polygon points="60,6 50,1 50,11" />
          </svg>
        </Entry>
        <Entry text={t('firs.legend.dim')}>
          <span className="graph-legend__sample graph-legend__industry" data-dim="true">{industryLabel}</span>
        </Entry>
      </ul>
      <Title order={4}>{t('firs.legend.controls')}</Title>
      <ul className="graph-legend__controls">
        <li>{t('firs.legend.mouse')}</li>
        <li>{t('firs.legend.wheel')}</li>
        <li>{t('firs.legend.fingers')}</li>
        <li>{t('firs.legend.keyboard')}</li>
      </ul>
    </div>
  );
}

function Entry({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <li className="graph-legend__entry">
      <span className="graph-legend__shape">{children}</span>
      <span>{text}</span>
    </li>
  );
}
