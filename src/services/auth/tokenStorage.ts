import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as Keychain from 'react-native-keychain';
import type {
  SetOptions,
  GetOptions,
  BaseOptions,
} from 'react-native-keychain';

const TOKEN_SERVICE = 'data-entry-app-auth-tokens';
const TOKEN_USERNAME = 'googleTokens';

export type StoredAuthTokens = {
  idToken?: string | null;
  accessToken?: string | null;
  serverAuthCode?: string | null;
};

const keychainOptions: SetOptions = {
  service: TOKEN_SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const keychainGetOptions: GetOptions = {
  service: TOKEN_SERVICE,
};

const keychainBaseOptions: BaseOptions = {
  service: TOKEN_SERVICE,
};

const sanitizeTokens = (tokens: StoredAuthTokens): StoredAuthTokens | null => {
  const entries = Object.entries(tokens).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );

  if (!entries.length) {
    return null;
  }

  return Object.fromEntries(entries) as StoredAuthTokens;
};

export async function saveAuthTokens(tokens: StoredAuthTokens): Promise<void> {
  try {
    const sanitized = sanitizeTokens(tokens);
    if (!sanitized) {
      return;
    }

    const existing = await getAuthTokens();
    const merged = {
      ...existing,
      ...sanitized,
    };

    await Keychain.setGenericPassword(
      TOKEN_USERNAME,
      JSON.stringify(merged),
      keychainOptions
    );
  } catch (error) {
    console.error('Failed to save auth tokens to secure storage:', error);
    throw error;
  }
}

export async function getAuthTokens(): Promise<StoredAuthTokens | null> {
  try {
    const credentials = await Keychain.getGenericPassword(keychainGetOptions);
    if (!credentials) {
      return null;
    }
    return JSON.parse(credentials.password) as StoredAuthTokens;
  } catch (error) {
    console.error('Failed to load auth tokens from secure storage:', error);
    return null;
  }
}

export async function clearAuthTokens(): Promise<void> {
  try {
    await Keychain.resetGenericPassword(keychainBaseOptions);
  } catch (error) {
    console.error('Failed to clear auth tokens from secure storage:', error);
  }
}

export async function refreshAuthTokens(): Promise<StoredAuthTokens> {
  try {
    const hasPreviousSignIn = await GoogleSignin.hasPreviousSignIn();
    if (!hasPreviousSignIn) {
      throw new Error('SESSION_EXPIRED');
    }

    // Try getTokens() first - it uses the refresh token and can work even after 1 hour
    // This is more reliable than signInSilently() which can fail after inactivity
    let refreshedTokens: StoredAuthTokens = {};

    try {
      const googleTokens = await GoogleSignin.getTokens();
      if (googleTokens?.idToken) {
        refreshedTokens.idToken = googleTokens.idToken;
      }
      if (googleTokens?.accessToken) {
        refreshedTokens.accessToken = googleTokens.accessToken;
      }
      console.log('[TokenStorage] Got tokens via getTokens()');
    } catch (getTokensError) {
      console.log(
        '[TokenStorage] getTokens() failed, trying signInSilently()...',
        getTokensError
      );
    }

    // If getTokens() didn't provide an idToken, try signInSilently() as fallback
    if (!refreshedTokens.idToken) {
      try {
        const silentSignIn = await GoogleSignin.signInSilently();
        if (silentSignIn.type === 'success' && silentSignIn.data) {
          refreshedTokens.idToken = silentSignIn.data.idToken ?? null;
          refreshedTokens.serverAuthCode =
            silentSignIn.data.serverAuthCode ?? null;
          console.log('[TokenStorage] Got tokens via signInSilently()');
        } else {
          console.log(
            '[TokenStorage] signInSilently() returned:',
            silentSignIn.type
          );
        }
      } catch (silentError) {
        console.log('[TokenStorage] signInSilently() failed:', silentError);
        // If both methods fail, check if it's a sign-in required error
        if ((silentError as any)?.code === statusCodes.SIGN_IN_REQUIRED) {
          await clearAuthTokens();
          await GoogleSignin.signOut().catch(() => {});
          throw new Error('SESSION_EXPIRED');
        }
      }
    }

    // If we still don't have an idToken after both attempts, the session is expired
    if (!refreshedTokens.idToken) {
      await clearAuthTokens();
      await GoogleSignin.signOut().catch(() => {});
      throw new Error('SESSION_EXPIRED');
    }

    const sanitized = sanitizeTokens(refreshedTokens);
    if (!sanitized?.idToken) {
      throw new Error('Failed to refresh authentication tokens.');
    }

    await saveAuthTokens(sanitized);
    console.log('[TokenStorage] Tokens refreshed successfully');
    return sanitized;
  } catch (error) {
    console.error('[TokenStorage] Failed to refresh tokens:', error);
    if (
      (error as any)?.code === statusCodes.SIGN_IN_REQUIRED ||
      (error as Error)?.message === 'SESSION_EXPIRED'
    ) {
      await clearAuthTokens();
      await GoogleSignin.signOut().catch(() => {});
      throw new Error('SESSION_EXPIRED');
    }
    throw error;
  }
}

export async function getIdToken(
  options: { forceRefresh?: boolean } = {}
): Promise<string | null> {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const stored = await getAuthTokens();
    if (stored?.idToken) {
      return stored.idToken;
    }
  }

  try {
    const freshTokens = await refreshAuthTokens();
    return freshTokens.idToken ?? null;
  } catch (error) {
    console.error('Failed to refresh ID token:', error);
    if ((error as Error)?.message === 'SESSION_EXPIRED') {
      throw new Error('Session expired. Please sign in again.');
    }
    if (forceRefresh) {
      throw error;
    }
    return null;
  }
}

export async function getAccessToken(
  options: { forceRefresh?: boolean } = {}
): Promise<string | null> {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const stored = await getAuthTokens();
    if (stored?.accessToken) {
      return stored.accessToken;
    }
  }

  try {
    const freshTokens = await refreshAuthTokens();
    return freshTokens.accessToken ?? null;
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    if ((error as Error)?.message === 'SESSION_EXPIRED') {
      throw new Error('Session expired. Please sign in again.');
    }
    if (forceRefresh) {
      throw error;
    }
    return null;
  }
}
