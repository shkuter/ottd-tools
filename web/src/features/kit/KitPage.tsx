import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Checkbox,
  Fieldset,
  Group,
  List,
  Pagination,
  Paper,
  SegmentedControl,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { notifications } from '@mantine/notifications';
import { intlLocale, t } from '../../i18n';
import { BuyMenuNote } from '../../components/BuyMenuNote';
import { CargoIcon } from '../../components/CargoIcon';
import { Field } from '../../components/Field';
import { GuiIcon } from '../../components/GuiIcon';
import { IconSwitch } from '../../components/IconSwitch';
import { Money } from '../../components/Money';
import { CargoSelect, TrainSelect } from '../../components/PictureSelect';
import { PrefillNote } from '../../components/PrefillNote';
import { NestedSettingRow, SettingRow } from '../../components/SettingRow';
import { SummaryRow } from '../../components/SummaryRow';
import { TrainImage } from '../../components/TrainImage';
import { Warning } from '../../components/Warning';
import { SortableTh } from '../../components/table/SortableTh';
import { TableFrame } from '../../components/table/TableFrame';
import { sortRows, type SortState } from '../../components/table/sorting';
import { WINDOW_COLOURS, type WindowColour } from '../../skin';
import { useKitWindowStore } from '../../state/kitWindowStore';
import {
  SPECIMEN_AVAILABILITY,
  SPECIMEN_CARGO_ICON,
  SPECIMEN_CARGOS,
  specimenPrefill,
  SPECIMEN_PREFILL_VALUES,
  SPECIMEN_ROWS,
  SPECIMEN_SERIES,
  SPECIMEN_TRAINS,
  SPECIMEN_VANILLA_TRAIN,
} from './fixtures';

/**
 * Every control the interface has, in every window colour the shell knows.
 *
 * The point is to see a change to the skin land on the whole set at once: a
 * rule written against one tab tends to be right there and wrong two tabs over,
 * and the colours that only appear on the settings tab (the mauve window) would
 * otherwise have to be checked through the settings themselves, which do not
 * have one of every widget.
 *
 * It is a page for whoever edits the skin, not for whoever uses the calculator,
 * so it stays out of the tab bar and loads on its own.
 *
 * Two tiers. The controls, the text and the messages are repeated in every window colour —
 * that is where the difference between the colour groups shows. The list and the chart take a
 * screen each, so they are shown once, in the colour the picker at the top names; four copies
 * of them would make the page unreadable without showing anything more.
 *
 * The tier of one comes last on purpose: `openDropdown` in the visual checks opens the first
 * Select of the page and expects the grey window, so nothing that opens a list may stand
 * above the repeated tier.
 */

const OPTIONS = ['kit.optionFirst', 'kit.optionSecond', 'kit.optionThird'];

/*
 * Three of the dropdowns are there for what a plain three-word list cannot show: an option
 * longer than its field, a list of nothing but short options (the width the list may not fall
 * below, and the height of a row without a picture), and an option carrying a picture. They
 * are found by data-testid rather than by position.
 */

function Specimen({ showTooltip }: { showTooltip: boolean }) {
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [text, setText] = useState(t('kit.sampleValue'));
  const [amount, setAmount] = useState<string | number>(120);
  const [choice, setChoice] = useState<string | null>(OPTIONS[0]);
  const [longChoice, setLongChoice] = useState<string | null>('long');
  const [shortChoice, setShortChoice] = useState<string | null>('short');
  const [trainChoice, setTrainChoice] = useState<string | null>(SPECIMEN_TRAINS[0].value);
  const [iconOn, setIconOn] = useState(true);
  const [cargoChoice, setCargoChoice] = useState<string | null>(SPECIMEN_CARGOS[0].label);

  return (
    <Stack gap="md">
      <Title order={3}>{t('kit.section.controls')}</Title>
      <Group gap="sm" align="flex-end">
        <Button>{t('kit.button')}</Button>
        <Button data-testid="kit-pressed" aria-current="page">
          {t('kit.buttonPressed')}
        </Button>
        <Button disabled>{t('kit.buttonDisabled')}</Button>
        <Button variant="subtle">{t('kit.buttonSubtle')}</Button>
        <Button size="compact-md">{t('kit.buttonCompact')}</Button>
      </Group>

      <Group gap="sm" align="flex-end">
        <TextInput
          label={t('kit.textField')}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <NumberInput label={t('kit.numberField')} value={amount} onChange={setAmount} />
        <TextInput label={t('kit.fieldDisabled')} value={text} disabled readOnly />
        <Select
          label={t('kit.dropdown')}
          value={choice}
          onChange={setChoice}
          data={OPTIONS.map((key) => ({ value: key, label: t(key) }))}
        />
        <div data-testid="kit-dropdown-long">
          <Select
            className="kit-narrow-field"
            searchable
            label={t('kit.dropdownLong')}
            value={longChoice}
            onChange={setLongChoice}
            data={[
              { value: 'long', label: t('kit.optionLong') },
              { value: 'short', label: t('kit.optionShort') },
            ]}
          />
        </div>
        <div data-testid="kit-dropdown-short">
          <Select
            className="kit-narrow-field"
            label={t('kit.dropdownShort')}
            value={shortChoice}
            onChange={setShortChoice}
            data={[{ value: 'short', label: t('kit.optionShort') }]}
          />
        </div>
        <div data-testid="kit-dropdown-cargo">
          <CargoSelect
            className="kit-narrow-field"
            label={t('kit.dropdownCargo')}
            cargos={SPECIMEN_CARGOS}
            value={cargoChoice}
            onChange={setCargoChoice}
            data={SPECIMEN_CARGOS.map((cargo) => ({ value: cargo.label, label: t(cargo.name) }))}
          />
        </div>
        <div data-testid="kit-dropdown-picture">
          <TrainSelect
            label={t('kit.dropdownPicture')}
            value={trainChoice}
            onChange={setTrainChoice}
            data={SPECIMEN_TRAINS}
          />
        </div>
      </Group>

      <Group gap="lg">
        <Switch label={t('kit.switchOn')} checked={on} onChange={() => setOn(!on)} />
        <Switch label={t('kit.switchDisabled')} checked disabled />
        <Checkbox
          label={t('kit.checkbox')}
          checked={checked}
          onChange={(event) => setChecked(event.currentTarget.checked)}
        />
        <Button
          data-testid="kit-notify"
          onClick={() => notifications.show({ message: t('kit.notificationText') })}
        >
          {t('kit.notification')}
        </Button>
      </Group>

      <Group gap="sm" align="flex-end">
        <Field label={t('kit.fieldGroup')}>
          {({ labelId }) => (
            <SegmentedControl
              aria-labelledby={labelId}
              data={[t('kit.optionFirst'), t('kit.optionSecond')]}
            />
          )}
        </Field>
        <IconSwitch
          icon="subsidies"
          name={t('kit.iconSwitch')}
          checked={iconOn}
          onChange={setIconOn}
        />
        <GuiIcon name="subsidies" />
      </Group>

      <Tabs defaultValue="first">
        <Tabs.List>
          <Tabs.Tab value="first">{t('kit.optionFirst')}</Tabs.Tab>
          <Tabs.Tab value="second">{t('kit.optionSecond')}</Tabs.Tab>
          <Tabs.Tab value="third" disabled>
            {t('kit.optionThird')}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Title order={3}>{t('kit.section.messages')}</Title>
      <Alert title={t('kit.alert')}>{t('kit.alertText')}</Alert>
      <div data-testid="kit-warning">
        <Warning>{t('kit.warningText')}</Warning>
      </div>
      <Paper component="section" p="sm" data-testid="kit-panel">
        <Text>{t('kit.panelText')}</Text>
        <List>
          <List.Item>{t('kit.optionFirst')}</List.Item>
          <List.Item>{t('kit.optionSecond')}</List.Item>
        </List>
        <div data-testid="kit-buy-menu-note">
          <BuyMenuNote availability={SPECIMEN_AVAILABILITY} />
        </div>
        <div data-testid="kit-prefill-note">
          <PrefillNote
            origin={specimenPrefill(t('kit.prefillSource'))}
            current={SPECIMEN_PREFILL_VALUES}
          />
        </div>
      </Paper>

      <Title order={3}>{t('kit.section.settings')}</Title>
      <div data-testid="kit-setting-rows">
        <SettingRow label={t('kit.settingRow')} hint={t('kit.settingHint')}>
          <Switch checked={on} onChange={() => setOn(!on)} />
        </SettingRow>
        <NestedSettingRow label={t('kit.settingNested')}>
          <NumberInput value={amount} onChange={setAmount} />
        </NestedSettingRow>
      </div>

      <Table className="summary-table" withRowBorders={false} data-testid="kit-summary">
        <Table.Tbody>
          <SummaryRow label={t('kit.summaryRow')}>
            <Money value={12_400} />
          </SummaryRow>
          <SummaryRow label={t('kit.summaryLoss')}>
            <Money value={-3_200} />
          </SummaryRow>
        </Table.Tbody>
      </Table>

      {/* a short list in a box too small for it, so the scrollbar is on screen */}
      <div className="table-wrap" style={{ maxHeight: 140 }}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('kit.tableName')}</Table.Th>
              <Table.Th className="cell-num">{t('kit.tableValue')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {OPTIONS.concat(OPTIONS).map((key, row) => (
              <Table.Tr key={`${key}-${row}`}>
                <Table.Td>{t(key)}</Table.Td>
                <Table.Td className={`cell-num ${row % 2 ? 'profit' : 'loss'}`}>
                  {(row % 2 ? 1234 : -567).toLocaleString(intlLocale())}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>

      <Title order={3}>{t('kit.section.pictures')}</Title>
      <Group gap="sm" align="center" data-testid="kit-pictures">
        <TrainImage trainId={SPECIMEN_TRAINS[0].value} />
        <TrainImage trainId={SPECIMEN_VANILLA_TRAIN} />
        <CargoIcon icon={SPECIMEN_CARGO_ICON} />
        <Text>{t('kit.picturesText')}</Text>
      </Group>

      <Stack gap={2}>
        <Title order={3}>{t('kit.section.text')}</Title>
        <Title order={2}>{t('kit.heading')}</Title>
        <Text>{t('kit.body')}</Text>
        <Text className="dim">{t('kit.dimmed')}</Text>
        <Anchor href="#kit">{t('kit.link')}</Anchor>
        <Text>
          <span className="profit">{t('kit.profit')}</span> ·{' '}
          <span className="loss">{t('kit.loss')}</span>
        </Text>
        {/* last in the specimen, and open in the first one only: an open plate
            floats over whatever is beside it, and four at once would bury the
            controls this page exists to show */}
        <Tooltip label={t('kit.tooltipText')} opened={showTooltip || undefined} position="bottom">
          <Text data-testid="kit-tooltip">{t('kit.tooltip')}</Text>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

type ListColumn = 'name' | 'power' | 'cost' | 'profit';

/**
 * The specimens that take a screen each: a list in the frame the tabs use, the same frame with
 * nothing left in it, and the income chart. Shown once, in the colour the picker names — see
 * the note at the top of this file.
 */
function Showcase() {
  const [sort, setSort] = useState<SortState<ListColumn>>({ column: 'profit', descending: true });
  const [page, setPage] = useState(2);
  const collator = new Intl.Collator(intlLocale());
  const rows = sortRows(
    SPECIMEN_ROWS,
    sort,
    {
      name: (row) => row.name,
      power: (row) => row.power,
      cost: (row) => row.cost,
      profit: (row) => row.profit,
    },
    collator,
  );

  return (
    <Stack gap="md">
      <Title order={3}>{t('kit.section.lists')}</Title>
      {/* wider than its column on purpose: the edge columns hold while the rest scrolls */}
      <div className="kit-list" data-testid="kit-list">
        <TableFrame pinEdges rowCount={rows.length} emptyMessage={t('kit.listEmpty')}>
          <Table.Thead>
            <Table.Tr>
              <SortableTh column="name" sort={sort} onSort={setSort}>
                {t('kit.col.name')}
              </SortableTh>
              <SortableTh column="power" sort={sort} onSort={setSort} className="cell-num">
                {t('kit.col.power')}
              </SortableTh>
              <SortableTh column="cost" sort={sort} onSort={setSort} className="cell-money">
                {t('kit.col.cost')}
              </SortableTh>
              <SortableTh column="profit" sort={sort} onSort={setSort} className="cell-money">
                {t('kit.col.profit')}
              </SortableTh>
              <Table.Th className="cell-action" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td className="cell-vehicle">
                  <TrainImage trainId={row.id} /> {row.name}
                </Table.Td>
                <Table.Td className="cell-num">{row.power}</Table.Td>
                <Table.Td className="cell-money">
                  <Money value={row.cost} />
                </Table.Td>
                <Table.Td className={`cell-money ${row.profit < 0 ? 'loss' : 'profit'}`}>
                  <Money value={row.profit} />
                </Table.Td>
                <Table.Td className="cell-action">
                  <ActionIcon aria-label={t('kit.rowAction')}>→</ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </TableFrame>
      </div>

      <div data-testid="kit-list-empty">
        <TableFrame rowCount={0} emptyMessage={t('kit.listEmpty')} />
      </div>

      <Pagination total={5} value={page} onChange={setPage} data-testid="kit-pagination" />

      <Title order={3}>{t('kit.section.chart')}</Title>
      <div data-testid="kit-chart">
        <LineChart
          h={200}
          data={SPECIMEN_SERIES}
          dataKey="days"
          withDots={false}
          curveType="linear"
          strokeWidth={3}
          gridAxis="xy"
          gridProps={{ strokeDasharray: '0' }}
          series={[{ name: 'income', color: 'yellow.5', label: t('kit.chartSeries') }]}
          xAxisProps={{ type: 'number' }}
        />
      </div>
    </Stack>
  );
}

export default function KitPage() {
  /*
   * Dropdowns, tooltips and notifications render into a portal under <body>, so
   * a theme sitting on a section here never reaches them — only one on <html>
   * does. The shell owns that attribute (see App.tsx); this picker names the
   * colour and the shell puts it there.
   */
  const portalWindow = useKitWindowStore((s) => s.colour);
  const setPortalWindow = useKitWindowStore((s) => s.setColour);

  return (
    <div className="page-kit">
      <Title order={1}>{t('kit.title')}</Title>
      <Text className="hint">{t('kit.intro')}</Text>
      <Group gap="sm" align="center">
        <Text>{t('kit.portalWindow')}</Text>
        <SegmentedControl
          value={portalWindow}
          onChange={(value) => setPortalWindow(value as WindowColour)}
          data={WINDOW_COLOURS.map((colour) => ({ value: colour, label: t(`kit.window.${colour}`) }))}
        />
      </Group>
      {WINDOW_COLOURS.map((colour, index) => (
        <section key={colour} className="kit-window" data-window={colour}>
          <Fieldset legend={t(`kit.window.${colour}`)}>
            <Specimen showTooltip={index === 0} />
          </Fieldset>
        </section>
      ))}
      {/* the tier of one, in the colour the picker names — and last, so that the first Select
          of the page is still the one in the grey window */}
      <section className="kit-window" data-window={portalWindow} data-testid="kit-showcase">
        <Fieldset legend={t('kit.showcase')}>
          <Showcase />
        </Fieldset>
      </section>
    </div>
  );
}
