/**
 * @stina/orchestrator — runs the decision turn that closes the loop between
 * user (or app) input and Stina's response.
 *
 * v1 ships with a stub producer that emits a canned acknowledgement. The real
 * provider-backed producer will land in Phase 5 (Real Stina with provider) per
 * docs/redesign-2026/IMPLEMENTATION-STATUS.md, hooked behind the same
 * DecisionTurnProducer interface.
 *
 * See docs/redesign-2026/04-event-flow.md §"Lifecycle of a triggered thread"
 * for the design intent. This stub covers the user-triggered path only —
 * extension-emitted events ("emitEvent") are out of scope for v1.
 */

export {
  runDecisionTurn,
  type RunDecisionTurnInput,
  type RunDecisionTurnResult,
} from './runDecisionTurn.js'

export {
  cannedStubProducer,
  type DecisionTurnProducer,
  type DecisionTurnContext,
  type DecisionTurnOutput,
} from './producers/canned.js'

export {
  DefaultMemoryContextLoader,
  emptyMemoryContextLoader,
  type MemoryContext,
  type MemoryContextLoader,
} from './memory/MemoryContextLoader.js'

export {
  createProviderProducer,
  assembleSystemPrompt,
  mapTimelineToChatMessages,
  type ChatStreamDispatcher,
  type ProviderProducerOptions,
} from './producers/provider.js'

export {
  type TurnStreamEvent,
  type TurnStreamListener,
} from './streamEvents.js'

export {
  applyFailureFraming,
  type FailureFramingDeps,
} from './applyFailureFraming.js'
