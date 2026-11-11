import { textDiff } from '../src/components/textDiff';

describe('textDiff', () => {
  it('sends only the new characters when typing', () => {
    expect(textDiff('', 'H')).toEqual({ deletes: 0, insert: 'H' });
    expect(textDiff('Hel', 'Hello')).toEqual({ deletes: 0, insert: 'lo' });
  });

  it('sends Delete presses when characters are removed at the end', () => {
    expect(textDiff('Hello', 'Hell')).toEqual({ deletes: 1, insert: '' });
    expect(textDiff('Hello', '')).toEqual({ deletes: 5, insert: '' });
  });

  it('retypes from the first change for edits in the middle', () => {
    // "Hello" -> "Jello": delete all 5, type "Jello"
    expect(textDiff('Hello', 'Jello')).toEqual({ deletes: 5, insert: 'Jello' });
    // autocorrect "teh" -> "the"
    expect(textDiff('teh', 'the')).toEqual({ deletes: 2, insert: 'he' });
  });

  it('does nothing when unchanged', () => {
    expect(textDiff('abc', 'abc')).toEqual({ deletes: 0, insert: '' });
  });

  it('counts emoji as one character', () => {
    expect(textDiff('hi 👋', 'hi ')).toEqual({ deletes: 1, insert: '' });
  });
});
