import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import { getIdToken } from '../../services/auth/tokenStorage';
import type { CreateClientConfig } from './client/client.gen';

export const createClientConfig: CreateClientConfig = config => {
  if (!config) {
    throw new Error('Config is not provided.');
  }

  console.log('Creating custom client config with provided');
  const backendUrl = EXPO_PUBLIC_BACKEND_URL;
  console.log('EXPO_PUBLIC_BACKEND_URL:', backendUrl);
  if (!backendUrl) {
    throw new Error('Environment variable EXPO_PUBLIC_BACKEND_URL is not set or is empty.');
  }

  return {
    ...config,
    baseUrl: backendUrl,
    headers: {
      ...config.headers,
      Accept: 'application/json',
    },
    // Use a custom fetch that handles auth properly
    fetch: async (input, init) => {
      // Handle both string URL and Request object
      let url: string;
      let options: RequestInit = {};

      if (typeof input === 'string') {
        url = input;
        options = init || {};
      } else if (input instanceof Request) {
        url = input.url;
        options = {
          method: input.method,
          headers: input.headers,
          ...init,
        };
      } else {
        throw new Error('Invalid input to fetch');
      }

      const executeRequest = async (token?: string | null) => {
        const headers = {
          ...options.headers,
          ...(token && { Authorization: `Bearer ${token}` }),
        };

        return fetch(url, {
          ...options,
          headers,
        });
      };

      let idToken: string | null = null;
      try {
        idToken = await getIdToken();
      } catch (tokenError) {
        console.error('Error retrieving ID token:', tokenError);
      }

      let response = await executeRequest(idToken);

      if (response.status === 401) {
        try {
          console.log('[API Client] Received 401, attempting token refresh...');
          // Force refresh the token
          const refreshedToken = await getIdToken({ forceRefresh: true });
          if (refreshedToken && refreshedToken !== idToken) {
            console.log('[API Client] Token refreshed, retrying request...');
            // Create a new request with the refreshed token
            response = await executeRequest(refreshedToken);
            // If still 401 after refresh, the token refresh might have failed
            if (response.status === 401) {
              console.error(
                '[API Client] Still received 401 after token refresh. Token may be invalid or session expired.'
              );
            } else {
              console.log('[API Client] Request succeeded after token refresh');
            }
          } else if (!refreshedToken) {
            console.error(
              '[API Client] Failed to get refreshed token. User may need to re-authenticate.'
            );
          } else {
            console.warn(
              '[API Client] Refreshed token is the same as original. Token may not have been refreshed.'
            );
          }
        } catch (refreshError) {
          console.error(
            '[API Client] Failed to refresh ID token after 401 response:',
            refreshError
          );
          // Return the original 401 response so the caller can handle it
        }
      }

      return response;
    },
  };
};
