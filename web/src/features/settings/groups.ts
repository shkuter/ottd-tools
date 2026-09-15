/**
 * The groups of the settings tab in the order it shows them: the table of contents and the
 * groups are drawn from this one list, so a group cannot be added to one and missed by the
 * other. The ids are addresses a link can be shared by, so they stay put whatever the language.
 */
export const SETTINGS_GROUPS = [
  { id: 'settings-import', titleKey: 'savegame.title' },
  { id: 'settings-jgrpp', titleKey: 'settings.jgrpp' },
  { id: 'settings-newgrf', titleKey: 'settings.newgrf' },
  { id: 'settings-display', titleKey: 'settings.display' },
  { id: 'settings-finance', titleKey: 'settings.finance' },
  { id: 'settings-time', titleKey: 'settings.time' },
  { id: 'settings-vehicles', titleKey: 'settings.vehicles' },
  { id: 'settings-calc', titleKey: 'settings.calc' },
  { id: 'settings-storage', titleKey: 'settings.storage' },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id'];
