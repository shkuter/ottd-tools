/**
 * What the page claims to show, and what it deliberately does not.
 *
 * The claim is written down rather than remembered: a test walks `components/` and the
 * library imports of the tabs and holds them against these two lists, so a component added
 * to the app without a specimen fails there instead of quietly going unchecked.
 */
export const SHOWN_ELEMENTS = [
  'ActionIcon',
  'Alert',
  'Anchor',
  'Button',
  'BuyMenuNote',
  'CargoIcon',
  'CargoSelect',
  'Checkbox',
  'Field',
  'Fieldset',
  'Group',
  'GuiIcon',
  'IconSwitch',
  'LineChart',
  'List',
  'Money',
  'NestedSettingRow',
  'NumberInput',
  'Pagination',
  'Paper',
  'PrefillNote',
  'SegmentedControl',
  'Select',
  'SettingRow',
  'SortableTh',
  'Stack',
  'SummaryRow',
  'Switch',
  'Table',
  'TableFrame',
  'Tabs',
  'Text',
  'TextInput',
  'Title',
  'Tooltip',
  'TrainImage',
  'TrainSelect',
  'Warning',
];

/** Elements that need no specimen of their own, and why. */
export const EXEMPT_ELEMENTS: Record<string, string> = {
  Box: 'a div in library clothes — it draws nothing of its own',
  Image: 'the box a picture is drawn in; the pictures themselves are shown',
  Input: 'the wrapper Field is built from — the field is shown',
  MantineProvider: 'the shell that hands out the theme; it draws nothing',
  StrandedVehicles: 'a warning about its own occasion — Warning is shown',
  TrackTypeField: 'a dropdown that reads a setting — the dropdown itself is shown',
  UnstyledButton: 'a link in the clothes of a cargo cell — the cell and the link are shown',
  YearField: 'a number field that reads a setting — the number field is shown',
};

