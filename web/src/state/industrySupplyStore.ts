import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SEARCH_PARAMS, searchStorePersist, type SearchParams } from './searchParams';

/** Route the user gave one input of an industry. Zero means "not given". */
export interface InputRouteParams {
  distanceTiles: number;
  /** Output of the source industry, units per economy month. */
  productionPerMonth: number;
}

export const EMPTY_INPUT: InputRouteParams = { distanceTiles: 0, productionPerMonth: 0 };

/**
 * Key one input's route is stored under. The industry is part of it so the routes of two
 * industries that take the same cargo cannot be mistaken for each other — and so a player
 * coming back to an industry finds the numbers they entered for *that* one.
 */
export function inputKey(industryId: string, cargoLabel: string): string {
  return `${industryId}:${cargoLabel}`;
}

interface IndustrySupplyState extends SearchParams {
  /**
   * Industry being supplied. Empty when none was chosen; an id the active economy has no
   * industry for is dropped on read, the way the economy itself falls back (ADR-0002), so
   * switching economies cannot leave an industry from another set standing.
   */
  industryId: string;
  /** Route per input, by `inputKey`. */
  inputs: Record<string, InputRouteParams>;
  /** Distance the "same distance everywhere" action fills the inputs with. */
  commonDistanceTiles: number;
  setIndustryId: (id: string) => void;
  setStationTiles: (tiles: number) => void;
  setMaxTrains: (trains: number) => void;
  setAllowElectric: (allow: boolean) => void;
  setInput: (key: string, params: Partial<InputRouteParams>) => void;
  setCommonDistanceTiles: (tiles: number) => void;
  /** Fill the given inputs with one distance, leaving their outputs alone. */
  applyCommonDistance: (keys: string[]) => void;
}

export const useIndustrySupplyStore = create<IndustrySupplyState>()(
  persist(
    (set) => ({
      ...DEFAULT_SEARCH_PARAMS,
      industryId: '',
      inputs: {},
      commonDistanceTiles: 100,
      setIndustryId: (industryId) => set({ industryId }),
      setStationTiles: (stationTiles) => set({ stationTiles }),
      setMaxTrains: (maxTrains) => set({ maxTrains }),
      setAllowElectric: (allowElectric) => set({ allowElectric }),
      setInput: (key, params) =>
        set((s) => ({
          inputs: { ...s.inputs, [key]: { ...EMPTY_INPUT, ...s.inputs[key], ...params } },
        })),
      setCommonDistanceTiles: (commonDistanceTiles) => set({ commonDistanceTiles }),
      applyCommonDistance: (keys) =>
        set((s) => {
          const inputs = { ...s.inputs };
          for (const key of keys) {
            inputs[key] = {
              ...EMPTY_INPUT,
              ...inputs[key],
              distanceTiles: s.commonDistanceTiles,
            };
          }
          return { inputs };
        }),
    }),
    searchStorePersist<IndustrySupplyState>('ottd-tools-industry-supply'),
  ),
);
