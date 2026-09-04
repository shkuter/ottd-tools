/** Which panel of the network tab something belongs to. */
export type NetworkPanel = 'maintenance' | 'corridor' | 'signals';

/**
 * How the page addresses each panel. A panel takes its `id` from here and the summary links
 * to the same entry, so the two halves of an anchor cannot drift apart.
 */
export const NETWORK_ANCHORS: Record<NetworkPanel, string> = {
  maintenance: 'network-maintenance',
  corridor: 'network-corridor',
  signals: 'network-signals',
};

/** The link a summary row points at. */
export function panelHref(panel: NetworkPanel): string {
  return `#${NETWORK_ANCHORS[panel]}`;
}
