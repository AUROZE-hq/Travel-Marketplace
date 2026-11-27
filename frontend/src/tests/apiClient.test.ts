import axios, { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, setAuthTokens } from '../services/apiClient';

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  setAuthTokens(null, null);
  vi.restoreAllMocks();
});

describe('API client session rotation', () => {
  it('retries logout with the rotated refresh token after an expired access token', async () => {
    let attempts = 0;
    apiClient.defaults.adapter = async (config): Promise<AxiosResponse> => {
      attempts += 1;
      if (attempts === 1) {
        throw new AxiosError('Expired access token', 'ERR_BAD_RESPONSE', config, undefined, {
          config, data: {}, headers: {}, status: 401, statusText: 'Unauthorized',
        });
      }

      expect(config.headers.Authorization).toBe('Bearer new-access-token');
      expect(JSON.parse(config.data as string)).toEqual({ refreshToken: 'new-refresh-token' });
      return { config, data: undefined, headers: {}, status: 204, statusText: 'No Content' };
    };

    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { data: { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' } },
    });
    setAuthTokens('expired-access-token', 'old-refresh-token');

    await apiClient.post('/auth/logout', { refreshToken: 'old-refresh-token' });

    expect(attempts).toBe(2);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
