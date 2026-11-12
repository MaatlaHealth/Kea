/**
 * Test stub for the `server-only` marker package.
 *
 * The real package throws when it is resolved outside a React Server
 * Component, which is what keeps database and credential code out of the
 * browser bundle. Vitest runs in Node, so it is aliased to this empty module.
 */
export {};
