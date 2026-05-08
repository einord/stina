import { freshInstall } from './freshInstall.js'
import { typicalMorning } from './typicalMorning.js'
import { vacationModeActive } from './vacationModeActive.js'
import type { Scenario } from './types.js'

export type { Scenario } from './types.js'
export { freshInstall, typicalMorning, vacationModeActive }

/**
 * Registry of all scenarios, keyed by id. Used by the seed CLI to look up a
 * scenario from a slug argument.
 */
export const scenarios: Record<string, () => Scenario> = {
  'fresh-install': freshInstall,
  'typical-morning': typicalMorning,
  'vacation-mode-active': vacationModeActive,
}

export function getScenario(id: string): Scenario {
  const builder = scenarios[id]
  if (!builder) {
    const available = Object.keys(scenarios).join(', ')
    throw new Error(`Unknown scenario: ${id}. Available: ${available}`)
  }
  return builder()
}
