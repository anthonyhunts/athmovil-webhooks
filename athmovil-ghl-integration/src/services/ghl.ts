import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { GHLTokenResponse, GHLLocation } from '../types';

export class GHLService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.ghl.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28',
      },
    });
  }

  /**
   * Intercambiar codigo de autorizacion por tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GHLTokenResponse> {
    try {
      const response = await axios.post<GHLTokenResponse>(
        'https://services.leadconnectorhq.com/oauth/token',
        new URLSearchParams({
          client_id: config.ghl.clientId,
          client_secret: config.ghl.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${config.baseUrl}/oauth/callback`,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log('✅ GHL tokens obtained for location:', response.data.locationId);
      return response.data;
    } catch (error: any) {
      console.error('❌ GHL token exchange error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to exchange code for tokens');
    }
  }

  /**
   * Refrescar access token usando refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<GHLTokenResponse> {
    try {
      const response = await axios.post<GHLTokenResponse>(
        'https://services.leadconnectorhq.com/oauth/token',
        new URLSearchParams({
          client_id: config.ghl.clientId,
          client_secret: config.ghl.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log('🔄 GHL tokens refreshed');
      return response.data;
    } catch (error: any) {
      console.error('❌ GHL token refresh error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to refresh tokens');
    }
  }

  /**
   * Obtener informacion de una location
   */
  async getLocation(locationId: string, accessToken: string): Promise<GHLLocation> {
    try {
      const response = await this.client.get(`/locations/${locationId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      return response.data.location;
    } catch (error: any) {
      console.error('❌ GHL getLocation error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to get location');
    }
  }

  /**
   * Crear configuracion del payment provider para una location
   */
  async createPaymentProviderConfig(
    locationId: string,
    accessToken: string,
    providerConfig: {
      live: {
        apiKey: string;
        publishableKey: string;
      };
      test: {
        apiKey: string;
        publishableKey: string;
      };
    }
  ): Promise<any> {
    try {
      const response = await this.client.post(
        '/payments/custom-provider/provider',
        {
          locationId,
          ...providerConfig,
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      console.log('✅ Payment provider config created for:', locationId);
      return response.data;
    } catch (error: any) {
      console.error('❌ GHL createPaymentProviderConfig error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create payment provider config');
    }
  }

  /**
   * Notificar a GHL sobre el resultado de una transaccion
   */
  async notifyTransactionResult(
    locationId: string,
    accessToken: string,
    transactionId: string,
    result: {
      success: boolean;
      chargeId?: string;
      message?: string;
    }
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/payments/transactions/${transactionId}/notify`,
        result,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      console.log('📤 GHL notified about transaction:', transactionId);
      return response.data;
    } catch (error: any) {
      console.error('❌ GHL notifyTransaction error:', error.response?.data || error.message);
      // No throw - notification failure shouldn't break the flow
    }
  }

  /**
   * Generar URL de autorizacion OAuth
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: config.ghl.clientId,
      redirect_uri: `${config.baseUrl}/oauth/callback`,
      response_type: 'code',
      scope: 'payments.readonly payments.write locations.readonly',
    });

    if (state) {
      params.append('state', state);
    }

    return `${config.ghl.authUrl}?${params.toString()}`;
  }
}

// Singleton para uso global
export const ghlService = new GHLService();
