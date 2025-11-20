import { desc, eq } from 'drizzle-orm';

import store from '../store/src/index_new.js';

import { interactionMessagesTable, interactionsTable } from './store.js';
import { Interaction, NewInteraction, NewInteractionMessage } from './types.js';

class Chat {
  constructor() {}

  /**
   * Retrieves interactions for a specific or latest conversation.
   * @param conversationId The ID of the conversation to retrieve interactions for. If not provided, retrieves the latest interactions.
   */
  public async getInteractions(conversationId?: number) {
    const database = store.getDatabase();

    // Get the selected or latest conversation id
    const selectedConversationId =
      conversationId ??
      (
        await database
          ?.select()
          .from(interactionsTable)
          .orderBy(desc(interactionsTable.createdAt))
          .limit(1)
      )?.[0]?.conversationId;

    if (!selectedConversationId) {
      return [];
    }

    const result = await database
      ?.select()
      .from(interactionsTable)
      .where(eq(interactionsTable.conversationId, selectedConversationId));

    return result;
  }

  /**
   * Adds a new interaction to the database.
   */
  public async addInteraction(interaction: NewInteraction) {
    const database = store.getDatabase();

    await database?.insert(interactionsTable).values(interaction);
  }

  /**
   * Updates an existing interaction in the database.
   */
  public async updateInteraction(interaction: Partial<Interaction>) {
    const database = store.getDatabase();

    await database
      ?.update(interactionsTable)
      .set(interaction)
      .where(eq(interactionsTable.id, interaction.id));
  }

  /**
   * Adds a new interaction message to the database.
   */
  public async addInteractionMessage(interactionMessage: NewInteractionMessage) {
    const database = store.getDatabase();

    await database?.insert(interactionMessagesTable).values(interactionMessage);
  }
}

const chat = new Chat();
export default chat;
