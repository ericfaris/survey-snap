/**
 * Cap on replay attempts per receipt.
 *
 * McDonald's allows five surveys per month per restaurant, and each replay
 * re-enters the same code. A broken loop must never be able to burn that
 * allowance, so this is a hard stop, not a retry budget.
 */
export const MAX_REPLAY_ATTEMPTS = 2;
