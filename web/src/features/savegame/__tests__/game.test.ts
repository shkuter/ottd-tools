import { describe, expect, it } from 'vitest';
import { defaultCompanyId, differingSettings, groupOptions, groupWithDescendants, hasFinishedYear } from '../game';
import { SETTING_LABEL_KEYS } from '../settingNames';
import { snapshotSettings } from '../../../savegame/snapshotStore';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import type { SnapshotGroup, SnapshotTrain } from '../../../savegame/snapshot';
import type { ForecastBlocker } from '../routeRows';
import en from '../../../i18n/en.json';

const group = (id: number, parent: number | null, companyId = 0): SnapshotGroup => ({
  id,
  name: `group ${id}`,
  parent,
  companyId,
});

const train = (id: number, lastYear: number): SnapshotTrain =>
  ({ id, profitLastYear: lastYear }) as SnapshotTrain;

describe('the company the tab opens on', () => {
  it('is the first one a human plays', () => {
    expect(
      defaultCompanyId([
        { id: 0, name: '', isAi: true },
        { id: 1, name: '', isAi: false },
        { id: 2, name: '', isAi: false },
      ]),
    ).toBe(1);
  });

  it('falls back to the first company when every one of them is an AI', () => {
    expect(
      defaultCompanyId([
        { id: 3, name: '', isAi: true },
        { id: 4, name: '', isAi: true },
      ]),
    ).toBe(3);
  });

  it('is nobody in an empty game, without throwing', () => {
    expect(defaultCompanyId([])).toBe(0);
  });
});

describe('group filter', () => {
  it('includes the subgroups of the chosen group, as the game does', () => {
    const groups = [group(0, null), group(1, 0), group(2, 1), group(3, null)];
    expect(groupWithDescendants(groups, 0)).toEqual(new Set([0, 1, 2]));
    expect(groupWithDescendants(groups, 1)).toEqual(new Set([1, 2]));
    expect(groupWithDescendants(groups, 3)).toEqual(new Set([3]));
  });

  it('survives a group whose parent points back at it', () => {
    // a savegame is not supposed to hold this, but a cycle must not hang the tab
    const groups = [group(0, 1), group(1, 0)];
    expect(groupWithDescendants(groups, 0)).toEqual(new Set([0, 1]));
  });

  it('lists a company own groups, children under their parent', () => {
    const groups = [group(0, null), group(1, 0), group(2, null), group(9, null, 1)];
    expect(groupOptions(groups, 0)).toEqual([
      { id: 0, label: 'group 0', depth: 0 },
      { id: 1, label: 'group 1', depth: 1 },
      { id: 2, label: 'group 2', depth: 0 },
    ]);
    // the other company's groups belong to the other company
    expect(groupOptions(groups, 1)).toEqual([{ id: 9, label: 'group 9', depth: 0 }]);
  });

  it('keeps the subtree of a group whose parent belongs to someone else', () => {
    // group 5 hangs from a group of company 1, so it heads its own subtree here; group 6
    // under it must come along rather than disappearing with its parent
    const groups = [group(5, 9), group(6, 5), group(9, null, 1)];
    expect(groupOptions(groups, 0)).toEqual([
      { id: 5, label: 'group 5', depth: 0 },
      { id: 6, label: 'group 6', depth: 1 },
    ]);
  });
});

describe('a finished year to compare against', () => {
  it('is there as soon as one train earned or lost anything last year', () => {
    expect(hasFinishedYear([train(0, 0), train(1, 4200)])).toBe(true);
    expect(hasFinishedYear([train(0, -300)])).toBe(true);
  });

  it('is missing in the first year of a game, when nothing has one', () => {
    expect(hasFinishedYear([train(0, 0), train(1, 0)])).toBe(false);
    expect(hasFinishedYear([])).toBe(false);
  });
});

describe('settings that drifted since the import', () => {
  it('names nothing while the calculator still stands where the game did', () => {
    const settings = snapshotSettings({}, {});
    expect(differingSettings(settings, settings)).toEqual([]);
  });

  it('returns keys, not names, so the caller translates them while rendering', () => {
    const drifted = differingSettings(snapshotSettings({ dayLengthFactor: 4 }, { priceYear: 1975 }), {
      game: DEFAULT_GAME_SETTINGS,
      calc: DEFAULT_CALC_SETTINGS,
    });
    expect(drifted).toEqual(['settings.dayLength', 'settings.priceYear']);
  });

  it('says nothing about the track type, which its forecasts do not read', () => {
    // the track of a route is read off the consist running it, so a different choice on the
    // searching tabs moves no figure here — naming it would send the user after a drift
    // that does not exist
    const drifted = differingSettings(snapshotSettings({}, {}), {
      game: DEFAULT_GAME_SETTINGS,
      calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'ELRL' },
    });
    expect(drifted).toEqual([]);

    // a setting the forecast does read is still named, so this is an exception, not a hole
    expect(
      differingSettings(snapshotSettings({}, {}), {
        game: DEFAULT_GAME_SETTINGS,
        calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'ELRL', priceYear: 1975 },
      }),
    ).toEqual(['settings.priceYear']);
  });
});

describe('the reasons a route states instead of a forecast', () => {
  it('are all named in the dictionary', () => {
    // the key is built from the reason, so a reason without an entry renders as itself
    const reasons: ForecastBlocker[] = [
      'oneStop',
      'multiStop',
      'noCargo',
      'unmatchedVehicle',
      'cargoNotCarried',
      'mixedFleet',
      'noDistance',
    ];
    for (const reason of reasons) {
      expect(en, reason).toHaveProperty(`game.blocker.${reason}`);
    }
  });
});

describe('the setting label map', () => {
  it('names every setting of both kinds', () => {
    for (const key of Object.keys(DEFAULT_GAME_SETTINGS)) {
      expect(SETTING_LABEL_KEYS, `game.${key}`).toHaveProperty(key);
    }
    for (const key of Object.keys(DEFAULT_CALC_SETTINGS)) {
      expect(SETTING_LABEL_KEYS, `calc.${key}`).toHaveProperty(key);
    }
  });

  it('points every setting at a string the dictionary actually holds', () => {
    // a key with no entry renders as itself: the user would read "settings.dayLengthFactor"
    for (const [field, key] of Object.entries(SETTING_LABEL_KEYS)) {
      expect(en, `${field} → ${key}`).toHaveProperty(key);
    }
  });
});
