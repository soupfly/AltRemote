/**
 * The TV inserts whatever text it receives at its cursor (it doesn't replace the field),
 * so the phone keyboard sends only the change: Delete presses for characters removed
 * since the last send, then the new characters.
 *
 * Assumes the TV's cursor is at the end of what we've typed. Edits in the middle of the
 * phone's text are handled by deleting back to the first changed character and retyping
 * from there.
 */
export interface TextChange {
  /** Number of Delete (backspace) presses to send first */
  deletes: number;
  /** Text to insert after deleting */
  insert: string;
}

export function textDiff(previous: string, next: string): TextChange {
  // Compare by code point so emoji and other surrogate pairs aren't split.
  const prev = Array.from(previous);
  const nxt = Array.from(next);
  let common = 0;
  while (common < prev.length && common < nxt.length && prev[common] === nxt[common]) {
    common++;
  }
  return { deletes: prev.length - common, insert: nxt.slice(common).join('') };
}
