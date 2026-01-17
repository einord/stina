import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { AUTH_CONFIG } from '../constants.js'

/**
 * Passkey service configuration
 */
export interface PasskeyConfig {
  /** Relying Party name (displayed to user) */
  rpName?: string
  /** Relying Party ID (domain) */
  rpId: string
  /** Expected origin(s) for verification */
  origin: string | string[]
}

/**
 * User info for registration
 */
export interface PasskeyUser {
  id: string
  username: string
  displayName?: string
}

/**
 * Existing credential info for exclusion
 */
export interface ExistingCredential {
  /** Base64URL encoded credential ID */
  credentialId: string
  transports?: AuthenticatorTransport[]
}

/**
 * Stored credential info for authentication
 */
export interface StoredCredential {
  /** Base64URL encoded credential ID */
  credentialId: string
  /** Base64URL encoded public key */
  publicKey: string
  counter: number
  transports?: AuthenticatorTransport[]
}

/**
 * Registration verification result
 */
export interface RegistrationResult {
  verified: boolean
  registrationInfo?: {
    credential: {
      /** Credential ID as base64url string */
      id: string
      /** Public key as base64url string */
      publicKey: string
      /** Signature counter */
      counter: number
    }
    credentialDeviceType: string
    credentialBackedUp: boolean
  }
}

/**
 * Authentication verification result
 */
export interface AuthenticationResult {
  verified: boolean
  authenticationInfo: {
    newCounter: number
  }
}

/**
 * Service for WebAuthn passkey operations
 */
export class PasskeyService {
  private rpName: string
  private rpId: string
  private origin: string | string[]

  constructor(config: PasskeyConfig) {
    this.rpName = config.rpName ?? AUTH_CONFIG.RP_NAME
    this.rpId = config.rpId
    this.origin = config.origin
  }

  /**
   * Generate registration options for a new passkey
   */
  async generateRegistrationOptions(
    user: PasskeyUser,
    existingCredentials: ExistingCredential[] = []
  ): Promise<unknown> {
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: user.username,
      userDisplayName: user.displayName ?? user.username,
      // Don't prompt users for additional information about the authenticator
      attestationType: 'none',
      // Prevent users from re-registering existing authenticators
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports,
      })),
      authenticatorSelection: {
        // Require a resident key (passkey stored on device)
        residentKey: 'required',
        // Require user verification (biometric, PIN, etc.)
        userVerification: 'required',
        // Allow platform authenticators (Touch ID, Face ID, Windows Hello)
        // and cross-platform (security keys)
        authenticatorAttachment: undefined,
      },
    })

    return options
  }

  /**
   * Verify a registration response from the client
   */
  async verifyRegistration(
    expectedChallenge: string,
    response: unknown
  ): Promise<RegistrationResult> {
    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return { verified: false }
    }

    // The library returns credential id/publicKey - we convert to base64url strings
    const credInfo = verification.registrationInfo.credential

    return {
      verified: true,
      registrationInfo: {
        credential: {
          // Library v11 may return string or Uint8Array - handle both
          id:
            typeof credInfo.id === 'string'
              ? credInfo.id
              : uint8ArrayToBase64Url(credInfo.id),
          publicKey:
            typeof credInfo.publicKey === 'string'
              ? credInfo.publicKey
              : uint8ArrayToBase64Url(credInfo.publicKey),
          counter: credInfo.counter,
        },
        credentialDeviceType: verification.registrationInfo.credentialDeviceType,
        credentialBackedUp: verification.registrationInfo.credentialBackedUp,
      },
    }
  }

  /**
   * Generate authentication options for login
   */
  async generateAuthenticationOptions(
    allowCredentials?: ExistingCredential[]
  ): Promise<unknown> {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: 'required',
      // If specific credentials are provided, limit to those
      // Otherwise, allow the browser to show all available passkeys
      allowCredentials: allowCredentials?.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports,
      })),
    })

    return options
  }

  /**
   * Verify an authentication response from the client
   */
  async verifyAuthentication(
    expectedChallenge: string,
    response: unknown,
    credential: StoredCredential
  ): Promise<AuthenticationResult> {
    const verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: credential.credentialId,
        publicKey: base64UrlToUint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      },
    })

    return {
      verified: verification.verified,
      authenticationInfo: {
        newCounter: verification.authenticationInfo.newCounter,
      },
    }
  }

  /**
   * Update the Relying Party configuration
   * Note: This should only be done during initial setup
   */
  updateConfig(config: Partial<PasskeyConfig>): void {
    if (config.rpName) this.rpName = config.rpName
    if (config.rpId) this.rpId = config.rpId
    if (config.origin) this.origin = config.origin
  }

  /**
   * Get current RP configuration
   */
  getConfig(): PasskeyConfig {
    return {
      rpName: this.rpName,
      rpId: this.rpId,
      origin: this.origin,
    }
  }
}

/**
 * Helper to convert base64url string to Uint8Array
 */
export function base64UrlToUint8Array(base64url: string): Uint8Array {
  // Add padding if necessary
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Helper to convert Uint8Array to base64url string
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
