const IDENTIFIER_SUFFIX_LETTERS = "abcdefghijklmnopqrstuvwxyz";
const IDENTIFIER_SUFFIX_LENGTH = 6;

// A random 6-letter suffix (issue #46) used anywhere an entry needs a
// stable, collision-avoidable id the author never has to type themselves -
// unit/NCU identifiers (MapCanvas.jsx) and dialogue node ids
// (DialogueFields.jsx) both re-roll this on collision against their own set.
export function randomIdentifierSuffix() {
  let suffix = "";
  for (let i = 0; i < IDENTIFIER_SUFFIX_LENGTH; i++) {
    suffix += IDENTIFIER_SUFFIX_LETTERS[Math.floor(Math.random() * IDENTIFIER_SUFFIX_LETTERS.length)];
  }
  return suffix;
}
