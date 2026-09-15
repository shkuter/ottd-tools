import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { t } from '../i18n';
import {
  replaceConsist,
  restoreConsistAndRoute,
  type ConsistAndRoute,
} from '../state/consistReplacement';

/** How long the undo is offered; the notification goes away on its own after that. */
export const CONSIST_REPLACED_AUTO_CLOSE = 10_000;

/** Prefix of the notification ids; each replacement appends a number of its own. */
const ID_PREFIX = 'consist-replaced';

let sequence = 0;
/** The id of the replacement notification on screen right now, if any. */
let onScreen: string | null = null;

/**
 * Tells the player the consist was replaced and offers the previous one back.
 *
 * One undo at a time: a second replacement takes the first one's notification away, since its
 * button would otherwise put back a consist from before both — wiping the second one's work
 * along with the first. It has to be taken away explicitly: Mantine ignores a `show` whose id
 * is already on screen, so a fixed id would leave the first notification and its button in
 * place. Every replacement gets an id of its own for the same reason — reusing one would also
 * keep the old notification's close timer running for the new one.
 *
 * The button does not navigate: the undo leaves the player on whatever tab they are on. That
 * is also why this works from outside the router, where `<Notifications />` is mounted.
 */
function notifyConsistReplaced(snapshot: ConsistAndRoute, message: string): void {
  if (onScreen !== null) notifications.hide(onScreen);
  const id = `${ID_PREFIX}-${++sequence}`;
  onScreen = id;
  notifications.show({
    id,
    autoClose: CONSIST_REPLACED_AUTO_CLOSE,
    onClose: () => {
      if (onScreen === id) onScreen = null;
    },
    message: (
      <Group gap="xs" justify="space-between">
        <Text component="span">{message}</Text>
        <Button
          size="compact-sm"
          onClick={() => {
            restoreConsistAndRoute(snapshot);
            notifications.hide(id);
          }}
        >
          {t('notify.restoreConsist')}
        </Button>
      </Group>
    ),
  });
}

/**
 * The one way an action replaces the consist: the write, and the undo offered for it when there
 * was a consist to lose. Every action that overwrites the builder goes through here, so none of
 * them can replace it without the way back.
 */
export function replaceConsistWithUndo(write: () => void, message: string): void {
  const replaced = replaceConsist(write);
  if (replaced) notifyConsistReplaced(replaced, message);
  // A replacement over an empty builder offers nothing back, but it still makes an earlier
  // undo stale: that button would put back a consist from before this write and wipe it.
  else dismissConsistReplaced();
}

/** Takes the replacement notification off the screen, if one is there. */
function dismissConsistReplaced(): void {
  if (onScreen === null) return;
  notifications.hide(onScreen);
  onScreen = null;
}
