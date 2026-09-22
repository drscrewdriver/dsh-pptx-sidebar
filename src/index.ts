/**
 * Node half of `dsh-pptx-sidebar`.
 *
 * The Cordis loader needs one entry point per profile row. This plugin's
 * behaviour lives entirely in the browser half: the viewer is registered
 * through dsh-better-sidebar's client service and reads the archive's bytes off
 * that plugin's own `/sidebar/file` route (which owns the workspace path
 * fence). So this half installs nothing — no route, no tool, no state.
 */

/** Profile row identity; must match `cordis.patch.yml` and `package.json#name`. */
export const name = 'dsh-pptx-sidebar'

/** Host-side apply. Intentionally empty — see the module docblock. */
export function apply(): void {}
