/**
 * Whether the demo affordances are present.
 *
 * Off unless the flag is exactly "true", so a store build cannot carry the demo
 * controls or the bundled sign-in by accident. Enabling it takes a deliberate
 * line in eas.json or on the export command.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
