/**
 * Authentication types for WebAuthn/passkey authentication.
 *
 * Core types (User, DeviceInfo, Invitation, SetupStatus, RegistrationOptionsResponse,
 * AuthResponse, InvitationValidation, TokenPair, AuthState) are defined in @stina/api-client
 * and re-exported here for backward compatibility.
 */

// Re-export from api-client for backward compatibility
export type {
  User,
  TokenPair,
  AuthState,
  DeviceInfo,
  Invitation,
  SetupStatus,
  RegistrationOptionsResponse,
  AuthResponse,
  InvitationValidation,
} from '@stina/api-client'
