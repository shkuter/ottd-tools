import { describe, expect, it } from 'vitest';
import { WINDOW_COLOURS } from '../../skin';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { describeFindings, offPalette } from './findings';
import { PORTALS, openKit, showGroup } from './kit';
import { ROUTES } from './routes';

/**
 * Every colour on screen is a colour of the game — checked where the colour
 * actually lands rather than where it is written down. This is the class of
 * defect skin-palette.test.ts cannot see: a colour handed over by the component
 * library or by the browser's own stylesheet appears in no rule of ours.
 *
 * The dropdown, the tooltip and the notification are brought up on purpose:
 * they render into a portal, and a theme that fails to reach them shows up as a
 * colour from the base theme in a window painted otherwise.
 *
 * The tabs are swept too: /kit has every control but no page layout, and a
 * colour can just as well arrive from something only one tab renders — the chain
 * graph and the income chart both paint from their own data.
 */

const harness = harnessFixture();

describe('the interface-elements page', () => {
  it.each(WINDOW_COLOURS)('paints the %s window in palette colours only', async (group) => {
    const page = await openKit(harness());
    await showGroup(page, group);

    const findings = offPalette(await page.evaluate(snapshot));
    for (const showPortal of PORTALS) {
      await showPortal(page, group);
      findings.push(...offPalette(await page.evaluate(snapshot)));
    }

    expect(findings, describeFindings(findings)).toHaveLength(0);
  });
});

describe.each(ROUTES)('$path', (route) => {
  it('paints in palette colours only', async () => {
    const page = await harness().goto(route.path, route.ready);
    const findings = offPalette(await page.evaluate(snapshot));
    expect(findings, describeFindings(findings)).toHaveLength(0);
  });
});
