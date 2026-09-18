/**
 * Getting the vision key into the eval without the shell in the way.
 *
 * Setting it by hand in zsh went wrong three different ways in one afternoon: set but
 * not exported, so npm never saw it; an older key still exported in the same window;
 * and a value whose length changed between the shell and Node, which is what stray
 * characters from a copy look like. Each failed as "not set" or a bare 401, and none
 * said which. So when VISION_API_KEY is not set, the eval asks for the key itself,
 * with the input hidden, and checks what it was given before anything is sent.
 *
 * The key lives in this process's memory and nowhere else: not written to disk, not
 * logged, not put in the environment of anything it starts.
 */

/** What a Console API key is made of. Anything else in the value was not in the key. */
const KEY_CHARACTER = /[A-Za-z0-9_-]/;

export interface CleanedKey {
  key: string;
  /** Terminal control codes and surrounding whitespace removed – a paste's wrapping, not the key. */
  removed: number;
  /** Characters no API key contains – a smart dash, a non-breaking space. Not removed: refused. */
  unexpected: number;
}

/**
 * Takes off what a terminal wraps around a paste, and counts what is left over.
 *
 * Only unambiguous wrapping is removed: escape sequences (a terminal marks a paste
 * with `ESC[200~` … `ESC[201~`), other control characters, and whitespace at the ends.
 * A character that could have been meant – a curly dash where a hyphen belongs – is
 * counted and refused rather than repaired, because a key "fixed" by guessing is a
 * 401 nobody can explain.
 */
export function cleanKey(raw: string): CleanedKey {
  const key = raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return {
    key,
    removed: raw.length - key.length,
    unexpected: [...key].filter((c) => !KEY_CHARACTER.test(c)).length,
  };
}

/** Why a key cannot be used, in words a person can act on – or null when it looks right. Never quotes the key. */
export function keyProblem({ key, unexpected }: CleanedKey): string | null {
  if (key === '') return 'No key was entered.';
  if (unexpected > 0) {
    return (
      `The key has ${unexpected} character${unexpected === 1 ? '' : 's'} an API key never contains – usually a ` +
      'smart dash or a hidden space picked up by copying through another app. Copy it again with the ' +
      "Console's Copy button and paste it straight in."
    );
  }
  if (/^sk-ant-admin/.test(key)) return 'That is an Admin key, which cannot call models. Create a regular API key in the Console.';
  if (!/^sk-ant-api\d\d-/.test(key)) return 'That is not a Console API key – those start with sk-ant-api03-.';
  return null;
}

/** "108 characters" – what was received, without the key. */
export function describeKey(cleaned: CleanedKey): string {
  const wrapping = cleaned.removed > 0 ? ` (${cleaned.removed} characters of paste wrapping removed)` : '';
  return `${cleaned.key.length} characters${wrapping}`;
}

/**
 * Reads the key from the terminal with nothing echoed. Enter finishes, Backspace
 * deletes, Ctrl-C quits. Resolves null when there is no terminal to ask – the output
 * of a pipe, say – so the caller can say so instead of hanging.
 */
export function askForKey(prompt: string): Promise<string | null> {
  const input = process.stdin;
  if (!input.isTTY) return Promise.resolve(null);

  return new Promise((resolve) => {
    let typed = '';
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();

    const finish = (value: string | null) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stderr.write('\n');
      resolve(value);
    };

    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === '\x03') {
          // Ctrl-C
          finish(null);
          process.exit(130);
        }
        if (char === '\r' || char === '\n') {
          // A paste that ends in a newline finishes the entry; anything after it in the
          // same chunk is not part of the key.
          if (typed.trim() !== '') return finish(typed);
          continue;
        }
        if (char === '\x7f' || char === '\b') {
          // Backspace
          typed = typed.slice(0, -1);
          continue;
        }
        typed += char;
      }
    }
    input.on('data', onData);
  });
}

/**
 * An API error message made safe to print and to save.
 *
 * The message is the diagnosis – "credit balance is too low", "image exceeds 5 MB" –
 * and hiding it turned one 400 into an afternoon of guessing. But an error can quote
 * the request, and the request carries photos and the key, so any long unbroken run of
 * base64 or key characters is blanked, the key itself is removed if it appears, and the
 * message is capped.
 */
export function safeErrorMessage(message: string, key: string): string {
  return (key ? message.split(key).join('[key]') : message)
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '[…]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
