/**
 * @stina/threads — Thread + Message persistence and the thread state machine.
 *
 * Implements the Thread layer described in docs/redesign-2026/02-data-model.md
 * and the lifecycle described in docs/redesign-2026/04-event-flow.md.
 *
 * Public types live in @stina/core (Thread, Message, ThreadTrigger, etc.).
 * This package owns the database schema, the migrations, and the runtime
 * repositories that read and write Threads and Messages.
 */

export {
  ThreadRepository,
  threadsSchema,
  threads,
  messages,
  getThreadsMigrationsPath,
  type ThreadsDb,
  type CreateThreadInput,
  type ListThreadsOptions,
} from './db/index.js'

export {
  deriveTitleFromAppContent,
  deriveLinkedEntities,
  type DeriveLinkedEntitiesInput,
} from './triggerDerivation.js'
