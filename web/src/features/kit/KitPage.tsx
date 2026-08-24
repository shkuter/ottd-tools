import { useState } from 'react';
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Fieldset,
  Group,
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
import { notifications } from '@mantine/notifications';
import { intlLocale, t } from '../../i18n';
import { WINDOW_COLOURS, type WindowColour } from '../../skin';
import { useKitWindowStore } from '../../state/kitWindowStore';

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
 */

const OPTIONS = ['kit.optionFirst', 'kit.optionSecond', 'kit.optionThird'];

function Specimen({ showTooltip }: { showTooltip: boolean }) {
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [text, setText] = useState(t('kit.sampleValue'));
  const [amount, setAmount] = useState<string | number>(120);
  const [choice, setChoice] = useState<string | null>(OPTIONS[0]);

  return (
    <Stack gap="md">
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

      <Tabs defaultValue="first">
        <Tabs.List>
          <Tabs.Tab value="first">{t('kit.optionFirst')}</Tabs.Tab>
          <Tabs.Tab value="second">{t('kit.optionSecond')}</Tabs.Tab>
          <Tabs.Tab value="third" disabled>
            {t('kit.optionThird')}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Alert title={t('kit.alert')}>{t('kit.alertText')}</Alert>

      {/* a short list in a box too small for it, so the scrollbar is on screen */}
      <div className="table-wrap" style={{ maxHeight: 140 }}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('kit.tableName')}</Table.Th>
              <Table.Th>{t('kit.tableValue')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {OPTIONS.concat(OPTIONS).map((key, row) => (
              <Table.Tr key={`${key}-${row}`}>
                <Table.Td>{t(key)}</Table.Td>
                <Table.Td className={row % 2 ? 'profit' : 'loss'}>
                  {(row % 2 ? 1234 : -567).toLocaleString(intlLocale())}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>

      <Stack gap={2}>
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
    </div>
  );
}
