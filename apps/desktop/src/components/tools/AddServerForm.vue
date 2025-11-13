<template>
  <div class="add-server-form" :class="{ expanded: isExpanded }">
    <button v-if="!isExpanded" class="expand-button" @click="isExpanded = true">
      <span class="icon">+</span>
      {{ t('tools.add_server.button') }}
    </button>

    <div v-else class="form-content">
      <div class="form-header">
        <h3 class="form-title">{{ t('tools.add_server.title') }}</h3>
        <button class="close-button" @click="cancel">✕</button>
      </div>

      <div class="form-fields">
        <div class="form-group">
          <label for="server-name" class="label">{{ t('tools.add_server.name_label') }}</label>
          <input
            id="server-name"
            v-model="form.name"
            type="text"
            class="input"
            :placeholder="t('tools.add_server.name_placeholder')"
            @keyup.enter="save"
          />
        </div>

        <div class="form-group">
          <label class="label">{{ t('tools.add_server.connection_type') }}</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" v-model="form.type" value="websocket" class="radio-input" />
              <span class="radio-text">{{ t('tools.add_server.websocket_url') }}</span>
            </label>
            <label class="radio-label">
              <input type="radio" v-model="form.type" value="stdio" class="radio-input" />
              <span class="radio-text">{{ t('tools.add_server.command_stdio') }}</span>
            </label>
          </div>
        </div>

        <div v-if="form.type === 'websocket'" class="form-group">
          <label for="server-url" class="label">{{ t('tools.add_server.websocket_url') }}</label>
          <input
            id="server-url"
            v-model="form.url"
            type="text"
            class="input"
            :placeholder="t('tools.add_server.websocket_placeholder')"
            @keyup.enter="save"
          />
          <span class="hint">{{ t('tools.add_server.websocket_hint') }}</span>
        </div>

        <div v-else class="form-group">
          <label for="server-command" class="label">{{
            t('tools.add_server.command_label')
          }}</label>
          <input
            id="server-command"
            v-model="form.command"
            type="text"
            class="input input-mono"
            :placeholder="t('tools.add_server.command_placeholder')"
            @keyup.enter="save"
          />
          <span class="hint">{{ t('tools.add_server.command_hint') }}</span>
        </div>

        <div class="divider" />

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.oauthEnabled" class="checkbox-input" />
            <span>{{ t('tools.add_server.enable_oauth') }}</span>
          </label>
          <span class="hint">{{ t('tools.add_server.oauth_hint') }}</span>
        </div>

        <div v-if="form.oauthEnabled" class="oauth-grid">
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_authorization_url') }}</label>
            <input
              v-model="form.oauth.authorizationUrl"
              type="text"
              class="input"
              :placeholder="t('tools.add_server.oauth_authorization_placeholder')"
            />
          </div>
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_token_url') }}</label>
            <input
              v-model="form.oauth.tokenUrl"
              type="text"
              class="input"
              :placeholder="t('tools.add_server.oauth_token_placeholder')"
            />
          </div>
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_client_id') }}</label>
            <input
              v-model="form.oauth.clientId"
              type="text"
              class="input"
              :placeholder="t('tools.add_server.oauth_client_id_placeholder')"
            />
          </div>
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_client_secret') }}</label>
            <input
              v-model="form.oauth.clientSecret"
              type="password"
              class="input"
              :placeholder="t('tools.add_server.oauth_client_secret_placeholder')"
            />
          </div>
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_scope') }}</label>
            <input
              v-model="form.oauth.scope"
              type="text"
              class="input"
              :placeholder="t('tools.add_server.oauth_scope_placeholder')"
            />
          </div>
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_redirect_uri') }}</label>
            <input
              v-model="form.oauth.redirectUri"
              type="text"
              class="input"
              :placeholder="t('tools.add_server.oauth_redirect_placeholder')"
            />
            <span class="hint">{{ t('tools.add_server.oauth_redirect_hint') }}</span>
          </div>
          <div class="form-group">
            <label class="label">{{ t('tools.add_server.oauth_header_name') }}</label>
            <input
              v-model="form.oauth.headerName"
              type="text"
              class="input"
              :placeholder="t('tools.add_server.oauth_header_placeholder')"
            />
          </div>
          <div class="form-group checkbox-row">
            <label class="checkbox-label">
              <input
                type="checkbox"
                v-model="form.oauth.sendRawAccessToken"
                class="checkbox-input"
              />
              <span>{{ t('tools.add_server.oauth_send_raw') }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" @click="cancel">
          {{ t('tools.add_server.cancel') }}
        </button>
        <button class="btn btn-primary" @click="save" :disabled="!isValid">
          {{ t('tools.add_server.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { MCPServer, MCPServerType } from '@stina/settings';
  import { computed, reactive, ref } from 'vue';

  const emit = defineEmits<{
    save: [
      server: {
        name: string;
        type: MCPServerType;
        url?: string;
        command?: string;
        oauth?: MCPServer['oauth'];
      },
    ];
  }>();

  const isExpanded = ref(false);
  const form = reactive({
    name: '',
    type: 'websocket' as MCPServerType,
    url: '',
    command: '',
    oauthEnabled: false,
    oauth: {
      authorizationUrl: '',
      tokenUrl: '',
      clientId: '',
      clientSecret: '',
      scope: '',
      redirectUri: '',
      headerName: '',
      sendRawAccessToken: false,
    },
  });

  const isValid = computed(() => {
    const hasName = form.name.trim() !== '';
    if (form.type === 'websocket') {
      const hasUrl = form.url.trim() !== '';
      return hasName && hasUrl && isOAuthValid();
    } else {
      return hasName && form.command.trim() !== '' && isOAuthValid();
    }
  });

  function save() {
    if (!isValid.value) return;

    const server: {
      name: string;
      type: MCPServerType;
      url?: string;
      command?: string;
      oauth?: MCPServer['oauth'];
    } = {
      name: form.name.trim(),
      type: form.type,
    };

    if (form.type === 'websocket') {
      server.url = form.url.trim();
    } else {
      server.command = form.command.trim();
    }

    const oauthPayload = buildOAuthPayload();
    if (oauthPayload) {
      server.oauth = oauthPayload;
    }

    emit('save', server);

    resetForm();
  }

  function cancel() {
    resetForm();
  }

  function resetForm() {
    form.name = '';
    form.type = 'websocket';
    form.url = '';
    form.command = '';
    form.oauthEnabled = false;
    form.oauth.authorizationUrl = '';
    form.oauth.tokenUrl = '';
    form.oauth.clientId = '';
    form.oauth.clientSecret = '';
    form.oauth.scope = '';
    form.oauth.redirectUri = '';
    form.oauth.headerName = '';
    form.oauth.sendRawAccessToken = false;
    isExpanded.value = false;
  }

  function isOAuthValid(): boolean {
    if (!form.oauthEnabled) return true;
    return (
      form.oauth.authorizationUrl.trim() !== '' &&
      form.oauth.tokenUrl.trim() !== '' &&
      form.oauth.clientId.trim() !== '' &&
      form.oauth.redirectUri.trim() !== ''
    );
  }

  function buildOAuthPayload(): MCPServer['oauth'] | undefined {
    if (!form.oauthEnabled) return undefined;
    if (!isOAuthValid()) return undefined;
    const payload: MCPServer['oauth'] = {
      authorizationUrl: form.oauth.authorizationUrl.trim(),
      tokenUrl: form.oauth.tokenUrl.trim(),
      clientId: form.oauth.clientId.trim(),
      redirectUri: form.oauth.redirectUri.trim(),
      sendRawAccessToken: form.oauth.sendRawAccessToken,
    };
    if (form.oauth.clientSecret.trim()) payload.clientSecret = form.oauth.clientSecret.trim();
    if (form.oauth.scope.trim()) payload.scope = form.oauth.scope.trim();
    if (form.oauth.headerName.trim()) payload.headerName = form.oauth.headerName.trim();
    return payload;
  }
</script>

<style scoped>
  .add-server-form {
    margin-bottom: var(--space-4);
  }

  .expand-button {
    width: 100%;
    padding: var(--space-4);
    background: var(--bg-elev);
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    transition: all 0.2s;
  }

  .expand-button:hover {
    background: var(--bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  .icon {
    font-size: var(--text-xl);
    font-weight: bold;
  }

  .form-content {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4);
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .form-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
  }

  .close-button {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
    padding: var(--space-1);
    line-height: 1;
    transition: color 0.2s;
  }

  .close-button:hover {
    color: var(--text);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .divider {
    border-top: 1px solid var(--border);
    margin: var(--space-3) 0;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }

  .checkbox-input {
    width: 16px;
    height: 16px;
  }

  .oauth-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-3);
  }

  .checkbox-row {
    grid-column: 1 / -1;
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text);
  }

  .radio-group {
    display: flex;
    gap: var(--space-4);
    margin-top: var(--space-1);
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    user-select: none;
  }

  .radio-input {
    cursor: pointer;
  }

  .radio-text {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-top: var(--space-1);
  }

  .input {
    padding: var(--space-2) var(--space-3);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    transition: border-color 0.2s;
  }

  .input-mono {
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
  }

  .input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .input::placeholder {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .btn {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg);
    color: var(--text);
  }

  .btn-secondary:hover {
    background: var(--bg-elev);
  }

  .btn-primary {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
