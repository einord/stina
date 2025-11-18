import { desc, eq } from 'drizzle-orm';

import index_new from '../store/src/index_new.js';

import { interactionsTable } from './store.js';

class Chat {
  constructor() {}

  /**
   * Retrieves interactions for a specific or latest conversation.
   * @param conversationId The ID of the conversation to retrieve interactions for. If not provided, retrieves the latest interactions.
   */
  public async getInteractions(conversationId?: number) {
    const db = index_new.getDatabase();

    // Get the selected or latest conversation id
    const selectedConversationId =
      interactionsTable.conversationId ??
      db?.select().from(interactionsTable).orderBy(desc(interactionsTable.createdAt)).limit(1);

    const result = await db
      ?.select()
      .from(interactionsTable)
      .where(eq(selectedConversationId, conversationId));

    return result;
  }
}

const chat = new Chat();
export default chat;
