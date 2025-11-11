import { t } from '@stina/i18n';
import { readSettings } from '@stina/settings';

/**
 * Generates a new prompt for starting a chat session.
 * Incorporates user profile information if available, or encourages gathering it and being welcoming.
 */
export async function generateNewSessionStartPrompt(): Promise<string> {
  const settings = await readSettings();

  // Retrieve the user's first name and nickname from settings
  const firstName = settings.userProfile?.firstName;
  const nickName = settings.userProfile?.nickname;

  const promptParts = [];
  const fullName =
    firstName && nickName == null
      ? `(${t('new_unknown_user_without_name')})`
      : firstName + (nickName ? ` (${nickName})` : '');

  // Build the prompt based on available user information
  promptParts.push(t('chat.new_session_prompt_start', { name: fullName })); // Who Stina is prompt
  promptParts.push(t('chat.new_session_prompt_initial_tool_info')); // Initial tool usage prompt
  if (firstName == null || nickName == null) {
    promptParts.push(t('chat.new_session_prompt_new_user'));
  } else {
    promptParts.push(t('chat.new_session_prompt_end', { name: nickName ?? firstName }));
  }

  return promptParts.join('\n');
}
