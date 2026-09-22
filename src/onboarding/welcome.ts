import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this phone has seen the welcome screen.
 *
 * One boolean, read once at launch. It is deliberately not part of the move: a move
 * is filed and reset, and the welcome must not come back every time somebody starts
 * a new one. Unreadable storage counts as "seen" – a person whose storage is failing
 * has bigger problems than a missed welcome, and a welcome that reappears on every
 * launch would be the worse bug.
 */
const KEY = 'loadsy.welcome.v1';

export async function readWelcomeSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'seen';
  } catch {
    return true;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'seen');
  } catch {
    // Nothing to do: the screen has been dismissed for this launch regardless.
  }
}
