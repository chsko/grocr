/** Invite codes are 6 characters; shared with the app so it knows when a code is complete. */
export const CODE_LENGTH = 6;

/** "k7m 42q" -> "K7M42Q". */
export function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
