/**
 * Node module-resolution hook for the domain test suite.
 *
 * Metro and tsc both resolve extensionless relative imports; Node's ESM loader does
 * not. This hook teaches Node the same rule so `npm test` can run the pure domain
 * logic through `--experimental-strip-types` with no bundler and no dependencies.
 * It touches nothing but relative specifiers that failed to resolve on their own.
 *
 * It also propagates the suite's `?case=` tag down relative imports. Several
 * modules here read their configuration once, at import, so a test that wants to
 * see a different environment re-imports them under a fresh query. Without the
 * propagation that gives you a fresh module wired to CACHED dependencies — which
 * is worse than no isolation at all, because it looks isolated: the module under
 * test re-reads the environment while the one it depends on keeps the value it
 * happened to be first imported with. That is a false pass waiting to happen, and
 * it produced one (a demo build reporting Premium as unreachable).
 *
 * The tag has to be spliced in BEFORE the extension, never after — `mode?case=x.ts`
 * is not a path.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
const TAG = /\?case=[^?#]*$/;

function tagOf(url) {
  if (typeof url !== 'string') return '';
  const match = TAG.exec(url);
  return match ? match[0] : '';
}

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith('.') || specifier.startsWith('/');
  const inherited = relative && !specifier.includes('?') ? tagOf(context.parentURL) : '';
  const tag = inherited || tagOf(specifier);
  const path = tag ? specifier.slice(0, specifier.length - tagOf(specifier).length) : specifier;

  try {
    return await nextResolve(path + tag, context);
  } catch (error) {
    if (!relative) throw error;
    for (const suffix of CANDIDATE_SUFFIXES) {
      try {
        return await nextResolve(path + suffix + tag, context);
      } catch {
        // try the next candidate
      }
    }
    throw error;
  }
}

register(pathToFileURL(import.meta.filename));
