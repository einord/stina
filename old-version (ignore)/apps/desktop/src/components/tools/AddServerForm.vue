<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { MCPAuthMode, MCPServer, MCPServerType } from '@stina/settings';
  import { computed, reactive, ref, watch } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import FormButtonSelect from '../form/FormButtonSelect.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import FormInputText from '../form/FormInputText.vue';

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
    cancel?: [];
  }>();

  const props = withDefaults(
    defineProps<{
      initialServer?: Partial<MCPServer>;
      autoExpand?: boolean;
      expandable?: boolean;
    }>(),
    {
      autoExpand: false,
      expandable: true,
    },
  );

  const isExpanded = ref(Boolean(props.autoExpand));
  const form = reactive({
    name: '',
    type: 'websocket' as MCPServerType,
    url: '',
    command: '',
    authMode: 'oauth' as MCPAuthMode,
    oauthEnabled: true,
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
    tokenAuth: {
      accessToken: '',
      headerName: '',
      tokenType: 'Bearer',
      sendRawAccessToken: false,
    },
  });

  const TOKEN_MASK = '********';
  const hasStoredToken = ref(false);
  const isValid = computed(() => {
    const hasName = form.name.trim() !== '';
    if (form.type === 'websocket' || form.type === 'sse') {
      const hasUrl = form.url.trim() !== '';
      if (!hasUrl) return false;
    } else if (form.command.trim() === '') {
      return false;
    } else {
      // stdio with command is fine
    }

    if (form.authMode === 'oauth') {
      return hasName && isOAuthValid();
    }
    if (form.authMode === 'token') {
      const val = form.tokenAuth.accessToken.trim();
      const hasMask = val === TOKEN_MASK;
      const hasInput = val !== '' && !hasMask;
      return hasName && (hasStoredToken.value || hasInput);
    }
    return hasName;
  });

  const headerTitle = computed(() =>
    props.initialServer ? t('tools.edit_server_title') : t('tools.add_server.title'),
  );
  const closeLabel = computed(() => t('tools.add_server.cancel'));

  const connectionTypeOptions = computed(() => [
    { value: 'websocket', label: t('tools.add_server.websocket_url') },
    { value: 'sse', label: t('tools.add_server.http_sse') },
    { value: 'stdio', label: t('tools.add_server.command_stdio') },
  ]);

  const authModeOptions = computed(() => [
    { value: 'oauth', label: t('tools.add_server.auth_mode_oauth') },
    { value: 'token', label: t('tools.add_server.auth_mode_token') },
    { value: 'none', label: t('tools.add_server.auth_mode_none') },
  ]);

  const isOAuth = computed(() => form.authMode === 'oauth');
  const isToken = computed(() => form.authMode === 'token');
  const showAdvanced = ref(false);
  const lastDerivedClientId = ref<string | null>(null);
  const tokenSaved = computed(() => hasStoredToken.value);

  function suggestRedirect(name: string) {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `stina://oauth/${slug || 'server'}`;
  }

  function deriveClientId(redirectUri?: string): string | undefined {
    if (!redirectUri) return undefined;
    try {
      const parsed = new URL(redirectUri);
      return parsed.origin;
    } catch {
      return undefined;
    }
  }

  /**
   * Populates the form with initial server data when editing.
   */
  function applyInitial(server?: Partial<MCPServer>) {
    if (!server) return;
    form.name = server.name ?? '';
    form.type = server.type ?? 'websocket';
    form.url = server.url ?? '';
    form.command = server.command ?? '';
    form.authMode =
      server.authMode ?? (server.oauth ? 'oauth' : server.tokenAuth ? 'token' : 'none');
    form.oauthEnabled = true;
    form.oauth.authorizationUrl = server.oauth?.authorizationUrl ?? '';
    form.oauth.tokenUrl = server.oauth?.tokenUrl ?? '';
    form.oauth.clientId = server.oauth?.clientId ?? '';
    form.oauth.clientSecret = '';
    form.oauth.scope = server.oauth?.scope ?? '';
    form.oauth.redirectUri = server.oauth?.redirectUri ?? '';
    form.oauth.headerName = server.oauth?.headerName ?? '';
    form.oauth.sendRawAccessToken = server.oauth?.sendRawAccessToken ?? false;
    hasStoredToken.value = Boolean(
      server.tokenAuth?.hasAccessToken || server.tokenAuth?.accessToken,
    );
    form.tokenAuth.accessToken = hasStoredToken.value
      ? TOKEN_MASK
      : (server.tokenAuth?.accessToken ?? '');
    form.tokenAuth.headerName = server.tokenAuth?.headerName ?? '';
    form.tokenAuth.tokenType = server.tokenAuth?.tokenType ?? 'Bearer';
    form.tokenAuth.sendRawAccessToken = server.tokenAuth?.sendRawAccessToken ?? false;
    lastDerivedClientId.value = deriveClientId(form.oauth.redirectUri) ?? null;
    isExpanded.value = true;
  }

  /**
   * Emits a valid server payload to the parent component.
   */
  function save() {
    if (!isValid.value) return;

    const server: {
      name: string;
      type: MCPServerType;
      url?: string;
      command?: string;
      authMode?: MCPAuthMode;
      oauth?: MCPServer['oauth'];
      tokenAuth?: MCPServer['tokenAuth'];
    } = {
      name: form.name.trim(),
      type: form.type,
      authMode: form.authMode,
    };

    if (form.type === 'websocket') {
      server.url = form.url.trim();
    } else {
      server.command = form.command.trim();
    }

    if (form.authMode === 'oauth') {
      const oauthPayload = buildOAuthPayload();
      if (oauthPayload) {
        server.oauth = oauthPayload;
      }
      server.tokenAuth = undefined;
    } else if (form.authMode === 'token') {
      const tokenPayload = buildTokenPayload();
      if (tokenPayload) server.tokenAuth = tokenPayload;
      server.oauth = undefined;
    } else {
      server.oauth = undefined;
      server.tokenAuth = undefined;
    }

    emit('save', server);
    resetForm();
  }

  /**
   * Resets state and notifies parent that the form was cancelled.
   */
  function cancel() {
    resetForm();
    emit('cancel');
  }

  /**
   * Restores default state and reapplies provided initial data.
   */
  function resetForm(initial?: Partial<MCPServer>) {
    form.name = '';
    form.type = 'websocket';
    form.url = '';
    form.command = '';
    form.oauthEnabled = true;
    form.oauth.authorizationUrl = '';
    form.oauth.tokenUrl = '';
    form.oauth.clientId = '';
    form.oauth.clientSecret = '';
    form.oauth.scope = '';
    form.oauth.redirectUri = '';
    form.oauth.headerName = '';
    form.oauth.sendRawAccessToken = false;
    form.tokenAuth.accessToken = '';
    form.tokenAuth.headerName = '';
    form.tokenAuth.tokenType = 'Bearer';
    form.tokenAuth.sendRawAccessToken = false;
    form.authMode = 'oauth';
    showAdvanced.value = false;
    hasStoredToken.value = false;
    isExpanded.value = props.expandable === false ? Boolean(props.autoExpand) : false;
    applyInitial(initial ?? props.initialServer);
  }

  /**
   * Validates required OAuth fields before saving.
   */
  function isOAuthValid(): boolean {
    if (!form.oauthEnabled) return true;
    return (
      form.oauth.authorizationUrl.trim() !== '' &&
      form.oauth.tokenUrl.trim() !== '' &&
      form.oauth.clientId.trim() !== '' &&
      form.oauth.redirectUri.trim() !== '' &&
      form.oauth.clientId.trim() !== ''
    );
  }

  /**
   * Builds the OAuth payload if enabled and valid.
   */
  function buildOAuthPayload(): MCPServer['oauth'] | undefined {
    if (!isOAuth.value) return undefined;
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

  function buildTokenPayload(): MCPServer['tokenAuth'] | undefined {
    if (!isToken.value) return undefined;
    const val = form.tokenAuth.accessToken.trim();
    const isMask = val === TOKEN_MASK;
    const hasInput = val !== '' && !isMask;
    const hasExisting = hasStoredToken.value;
    if (!hasInput && !hasExisting) return undefined;
    const payload: MCPServer['tokenAuth'] = {
      headerName: form.tokenAuth.headerName.trim() || undefined,
      tokenType: form.tokenAuth.tokenType.trim() || 'Bearer',
      sendRawAccessToken: form.tokenAuth.sendRawAccessToken,
    };
    if (hasInput) {
      payload.accessToken = val;
    }
    return payload;
  }

  watch(
    () => props.initialServer,
    (server) => {
      resetForm(server ?? undefined);
    },
  );

  watch(
    () => form.name,
    (name) => {
      if (!isOAuth.value) return;
      if (!form.oauth.redirectUri) {
        form.oauth.redirectUri = suggestRedirect(name);
      }
    },
  );

  watch(
    () => form.oauth.redirectUri,
    (uri) => {
      const derived = deriveClientId(uri);
      if (!derived) return;
      if (!form.oauth.clientId || form.oauth.clientId === lastDerivedClientId.value) {
        form.oauth.clientId = derived;
      }
      lastDerivedClientId.value = derived;
    },
  );

  watch(
    () => form.tokenAuth.accessToken,
    (val) => {
      if (val === TOKEN_MASK) return;
      if (val.trim() !== '') {
        hasStoredToken.value = false;
      }
    },
  );

  if (props.initialServer) {
    applyInitial(props.initialServer);
  }
</script>

<template>
  <div class="add-server-form">
    <div v-if="!isExpanded && expandable" class="collapsed">
      <div class="collapsed-copy">
        <h3>{{ headerTitle }}</h3>
        <p>{{ t('tools.add_server_hint') }}</p>
      </div>
      <SimpleButton type="primary" @click="isExpanded = true">
        {{ t('tools.add_server.button') }}
      </SimpleButton>
    </div>

    <form v-else class="form" @submit.prevent="save">
      <div v-if="expandable" class="inline-header">
        <h3>{{ headerTitle }}</h3>
        <SimpleButton class="close" :title="closeLabel" @click.prevent="cancel">
          {{ closeLabel }}
        </SimpleButton>
      </div>

      <div class="inputs">
        <FormInputText
          v-model="form.name"
          :label="t('tools.add_server.name_label')"
          :placeholder="t('tools.add_server.name_placeholder')"
          required
        />

        <FormButtonSelect
          v-model="form.type"
          :label="t('tools.add_server.connection_type')"
          :options="connectionTypeOptions"
          required
        />

        <FormInputText
          v-if="form.type === 'websocket'"
          v-model="form.url"
          :label="t('tools.add_server.websocket_url')"
          :placeholder="t('tools.add_server.websocket_placeholder')"
          :hint="t('tools.add_server.websocket_hint')"
          required
        />

        <FormInputText
          v-else
          v-model="form.command"
          :label="t('tools.add_server.command_label')"
          :placeholder="t('tools.add_server.command_placeholder')"
          :hint="t('tools.add_server.command_hint')"
          required
        />

        <FormButtonSelect
          v-model="form.authMode"
          :label="t('tools.add_server.auth_mode')"
          :options="authModeOptions"
          required
        />

        <div v-if="isOAuth" class="section">
          <div class="section-header">
            <h4>{{ t('tools.oauth.title') }}</h4>
            <span class="hint">{{ t('tools.add_server.oauth_hint') }}</span>
          </div>

          <FormInputText
            v-model="form.oauth.authorizationUrl"
            :label="t('tools.add_server.oauth_authorization_url')"
            :placeholder="t('tools.add_server.oauth_authorization_placeholder')"
            required
          />
          <FormInputText
            v-model="form.oauth.tokenUrl"
            :label="t('tools.add_server.oauth_token_url')"
            :placeholder="t('tools.add_server.oauth_token_placeholder')"
            required
          />
          <FormInputText
            v-model="form.oauth.redirectUri"
            :label="t('tools.add_server.oauth_redirect_uri')"
            :placeholder="t('tools.add_server.oauth_redirect_placeholder')"
            :hint="t('tools.add_server.oauth_redirect_hint')"
            required
          />
          <FormInputText
            v-model="form.oauth.clientId"
            :label="t('tools.add_server.oauth_client_id')"
            :placeholder="t('tools.add_server.oauth_client_id_placeholder')"
            :hint="t('tools.add_server.oauth_client_id_hint')"
            required
          />
          <FormInputText
            v-model="form.oauth.clientSecret"
            type="password"
            :label="t('tools.add_server.oauth_client_secret')"
            :placeholder="t('tools.add_server.oauth_client_secret_placeholder')"
          />

          <button class="advanced-toggle" type="button" @click="showAdvanced = !showAdvanced">
            {{
              showAdvanced
                ? t('tools.add_server.hide_advanced')
                : t('tools.add_server.show_advanced')
            }}
          </button>

          <div v-if="showAdvanced" class="advanced">
            <FormInputText
              v-model="form.oauth.scope"
              :label="t('tools.add_server.oauth_scope')"
              :placeholder="t('tools.add_server.oauth_scope_placeholder')"
            />
            <FormInputText
              v-model="form.oauth.headerName"
              :label="t('tools.add_server.oauth_header_name')"
              :placeholder="t('tools.add_server.oauth_header_placeholder')"
            />
            <FormCheckbox
              v-model="form.oauth.sendRawAccessToken"
              :label="t('tools.add_server.oauth_send_raw')"
            />
          </div>
        </div>

        <div v-if="isToken" class="section">
          <div class="section-header">
            <h4>{{ t('tools.add_server.token_title') }}</h4>
            <span class="hint">{{ t('tools.add_server.access_token_hint') }}</span>
          </div>
          <FormInputText
            v-model="form.tokenAuth.accessToken"
            type="password"
            :label="t('tools.add_server.access_token_label')"
            :placeholder="t('tools.add_server.access_token_placeholder')"
            required
          />
          <span v-if="tokenSaved" class="saved-token">{{
            t('tools.add_server.access_token_saved')
          }}</span>
          <button class="advanced-toggle" type="button" @click="showAdvanced = !showAdvanced">
            {{
              showAdvanced
                ? t('tools.add_server.hide_advanced')
                : t('tools.add_server.show_advanced')
            }}
          </button>
          <div v-if="showAdvanced" class="advanced">
            <FormInputText
              v-model="form.tokenAuth.headerName"
              :label="t('tools.add_server.oauth_header_name')"
              :placeholder="t('tools.add_server.oauth_header_placeholder')"
            />
            <FormInputText
              v-model="form.tokenAuth.tokenType"
              :label="t('tools.add_server.token_type_label')"
              :placeholder="t('tools.add_server.token_type_placeholder')"
            />
            <FormCheckbox
              v-model="form.tokenAuth.sendRawAccessToken"
              :label="t('tools.add_server.oauth_send_raw')"
            />
          </div>
        </div>
      </div>

      <div class="actions">
        <SimpleButton @click.prevent="cancel">
          {{ t('tools.add_server.cancel') }}
        </SimpleButton>
        <SimpleButton type="primary" :disabled="!isValid">
          {{ t('tools.add_server.save') }}
        </SimpleButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
  .add-server-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > .collapsed {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      border: 1px dashed var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--panel);

      > .collapsed-copy {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;

        > h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        > p {
          margin: 0;
          color: var(--muted);
          font-size: 0.95rem;
        }
      }
    }

    > .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--panel);

      > .inline-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;

        > h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        > .close {
          padding-inline: 0.75rem;
        }
      }

      > .inputs {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;

        > .section {
          border: 1px solid var(--border);
          border-radius: var(--border-radius-normal);
          padding: 0.85rem;
          background: var(--window-bg-lower);
          display: flex;
          flex-direction: column;
          gap: 0.65rem;

          > .section-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 0.75rem;

            > h4 {
              margin: 0;
              font-size: 1rem;
            }

            > .hint {
              color: var(--muted);
              font-size: 0.85rem;
            }
          }

          > .advanced-toggle {
            align-self: flex-start;
            background: none;
            border: none;
            color: var(--primary);
            cursor: pointer;
            padding: 0;
            font-weight: var(--font-weight-medium);

            &:hover {
              text-decoration: underline;
            }
          }

          > .advanced {
            display: grid;
            gap: 0.65rem;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          }

          > .saved-token {
            font-size: 0.85rem;
            color: var(--muted);
          }
        }
      }

      > .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
      }
    }
  }
</style>
