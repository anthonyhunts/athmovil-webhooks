import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { GHLTokenResponse } from '../types';
import { storage } from './storage';

export class GHLService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.ghl.apiUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28',
      },
    });
  }

  /**
   * Obtener un access token valido para una location.
   * Si el token esta expirado, lo refresca automaticamente.
   */
  async getValidAccessToken(locationId: string): Promise<string> {
    const location = storage.getLocation(locationId);
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    // Si el token expira en menos de 5 minutos, refrescar
    const fiveMinutes = 5 * 60 * 1000;
    if (location.expiresAt.getTime() - Date.now() < fiveMinutes) {
      console.log('🔄 Token expiring soon, refreshing for:', locationId);
      try {
        const newTokens = await this.refreshAccessToken(location.refreshToken);

        location.accessToken = newTokens.access_token;
        location.refreshToken = newTokens.refresh_token;
        location.expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
        storage.saveLocation(location);

        return newTokens.access_token;
      } catch (err) {
        console.error('❌ Token refresh failed for:', locationId, err);
        // Intentar con el token actual si el refresh falla
        return location.accessToken;
      }
    }

    return location.accessToken;
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
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
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
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
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
   * Crear configuracion del payment provider para una location
   */
  async createPaymentProviderConfig(
    locationId: string,
    providerConfig: {
      live: { apiKey: string; publishableKey: string };
      test: { apiKey: string; publishableKey: string };
    }
  ): Promise<any> {
    const accessToken = await this.getValidAccessToken(locationId);

    try {
      const response = await this.client.post(
        '/payments/custom-provider/provider',
        { locationId, ...providerConfig },
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      console.log('✅ Payment provider config created for:', locationId);
      return response.data;
    } catch (error: any) {
      console.error('❌ GHL createPaymentProviderConfig error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create payment provider config');
    }
  }

  /**
   * Notificar a GHL sobre el resultado de una transaccion.
   * Usa auto-refresh de tokens.
   */
  async notifyTransactionResult(
    locationId: string,
    transactionId: string,
    result: {
      success: boolean;
      chargeId?: string;
      message?: string;
    }
  ): Promise<void> {
    try {
      const accessToken = await this.getValidAccessToken(locationId);

      await this.client.post(
        `/payments/transactions/${transactionId}/notify`,
        result,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      console.log('📤 GHL notified about transaction:', transactionId);
    } catch (error: any) {
      console.error('❌ GHL notifyTransaction error:', error.response?.data || error.message);
      // Log but don't throw - notification failure shouldn't break webhook processing
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

export const ghlService = new GHLService();
