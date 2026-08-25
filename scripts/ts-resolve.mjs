/**
 * Node module-resolution hook for the domain test suite.
 *
 * Metro and tsc both resolve extensionless relative imports; Node's ESM loader does
 * not. This hook teaches Node the same rule so `npm test` can run the pure domain
 * logic through `--experimental-strip-types` with no bundler and no dependencies.
 * It touches nothing but relative specifiers that failed to resolve on their own.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw error;
    for (const suffix of CANDIDATE_SUFFIXES) {
      try {
        return await nextResolve(specifier + suffix, context);
      } catch {
        // try the next candidate
      }
    }
    throw error;
  }
}

register(pathToFileURL(import.meta.filename));
