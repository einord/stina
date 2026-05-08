/**
 * @stina/test-fixtures — deterministic factories, scenarios, and a seeder
 * for the redesign-2026 schema.
 *
 * Intent (per the design discussion summarized in docs/redesign-2026/09):
 * - Make UI development viable without invoking the AI runtime.
 * - Provide deterministic state for Playwright (and unit tests) to assert
 *   against — same fixtures, same screenshots, every run.
 * - Reuse the same fixtures for §08's synthetic v0.x snapshot tests when
 *   the migration runner lands.
 *
 * Usage:
 *   import { seed, getScenario } from '@stina/test-fixtures'
 *   const scenario = getScenario('typical-morning')
 *   seed(rawSqliteDb, scenario)
 *
 * Or via the CLI shipped with this package:
 *   pnpm --filter @stina/test-fixtures seed-dev-db typical-morning
 */

export * from './factories/index.js'
export {
  scenarios,
  getScenario,
  freshInstall,
  typicalMorning,
  vacationModeActive,
  type Scenario,
} from './scenarios/index.js'
export { seed, clearRedesign2026Tables, clearHistoryOnly, type SeedCounts } from './seed/seed.js'
