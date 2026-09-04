/**
 * What a count field steps to when it is empty.
 *
 * Several fields show a zero as an empty box on purpose — a count nobody stated is not a count
 * of none. Mantine steps an empty field to `startValue`, which is 0 by default, so those
 * fields would step from empty to zero and back to looking empty: the arrow appears dead.
 * Starting at one makes the first click do what it looks like it does.
 */
export const STEP_FROM_EMPTY = 1;
