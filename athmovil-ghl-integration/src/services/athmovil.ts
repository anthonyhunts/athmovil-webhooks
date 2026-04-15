import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import {
  ATHMovilPaymentRequest,
  ATHMovilPaymentResponse,
  ATHMovilFindPaymentResponse,
} from '../types';

export class ATHMovilService {
  private client: AxiosInstance;
  private publicToken: string;
  private privateToken: string;

  constructor(publicToken?: string, privateToken?: string) {
    this.publicToken = publicToken || config.athMovil.publicToken;
    this.privateToken = privateToken || config.athMovil.privateToken;

    this.client = axios.create({
      baseURL: config.athMovil.apiUrl,
      timeout: 30000, // 30 seconds max
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Verificar que las credenciales estan configuradas
   */
  hasCredentials(): boolean {
    return !!(this.publicToken && this.privateToken);
  }

  /**
   * Crear una nueva transaccion de pago
   */
  async createPayment(params: {
    total: number;
    tax?: number;
    subtotal?: number;
    metadata1?: string;
    metadata2?: string;
    items?: Array<{
      name: string;
      description?: string;
      quantity: number;
      price: number;
      tax?: number;
      metadata?: string;
    }>;
    timeout?: number;
  }): Promise<ATHMovilPaymentResponse> {
    if (!this.hasCredentials()) {
      throw new Error('ATH Movil credentials not configured');
    }

    // Validar rango de ATH Movil: $1.00 - $1,500.00
    if (params.total < 1 || params.total > 1500) {
      throw new Error('Amount must be between $1.00 and $1,500.00');
    }

    const payload: ATHMovilPaymentRequest = {
      publicToken: this.publicToken,
      total: params.total,
      tax: params.tax,
      subtotal: params.subtotal,
      metadata1: params.metadata1 ? params.metadata1.substring(0, 40) : undefined,
      metadata2: params.metadata2 ? params.metadata2.substring(0, 40) : undefined,
      items: params.items,
      timeout: Math.min(Math.max(params.timeout || 600, 120), 600),
    };

    try {
      const response = await this.client.post<ATHMovilPaymentResponse>(
        '/business-transaction/ecommerce/payment',
        payload
      );

      console.log('✅ ATH Movil payment created:', response.data.data.ecommerceId);
      return response.data;
    } catch (error: any) {
      console.error('❌ ATH Movil createPayment error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create ATH Movil payment');
    }
  }

  /**
   * Consultar el estado de una transaccion
   */
  async findPayment(ecommerceId: string): Promise<ATHMovilFindPaymentResponse> {
    if (!this.publicToken) {
      throw new Error('ATH Movil public token not configured');
    }

    try {
      const response = await this.client.post<ATHMovilFindPaymentResponse>(
        '/business-transaction/ecommerce/business/findPayment',
        {
          publicToken: this.publicToken,
          ecommerceId,
        }
      );

      console.log('📋 ATH Movil payment status:', ecommerceId, '->', response.data.data.status);
      return response.data;
    } catch (error: any) {
      console.error('❌ ATH Movil findPayment error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to find ATH Movil payment');
    }
  }

  /**
   * Actualizar numero de telefono para notificacion push
   */
  async updatePhoneNumber(ecommerceId: string, phoneNumber: string, authToken: string): Promise<any> {
    try {
      const response = await this.client.post(
        '/business-transaction/ecommerce/updatePhoneNumber',
        { ecommerceId, phoneNumber },
        {
          headers: { 'Authorization': `Bearer ${authToken}` },
        }
      );

      console.log('📱 Phone number updated for:', ecommerceId);
      return response.data;
    } catch (error: any) {
      console.error('❌ ATH Movil updatePhoneNumber error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to update phone number');
    }
  }

  /**
   * Procesar refund (reembolso)
   */
  async refundPayment(referenceNumber: string, amount: number): Promise<any> {
    if (!this.hasCredentials()) {
      throw new Error('ATH Movil credentials not configured');
    }

    if (amount <= 0) {
      throw new Error('Refund amount must be greater than 0');
    }

    try {
      const response = await this.client.post(
        '/business-transaction/ecommerce/refund',
        {
          publicToken: this.publicToken,
          privateToken: this.privateToken,
          referenceNumber,
          amount,
        }
      );

      console.log('💸 Refund processed for:', referenceNumber);
      return response.data;
    } catch (error: any) {
      console.error('❌ ATH Movil refund error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to process refund');
    }
  }

  /**
   * Suscribir webhook listener
   */
  async subscribeWebhook(listenerURL: string): Promise<any> {
    if (!this.hasCredentials()) {
      throw new Error('ATH Movil credentials not configured');
    }

    try {
      const response = await axios.post(
        config.athMovil.webhookUrl,
        {
          publicToken: this.publicToken,
          privateToken: this.privateToken,
          listenerURL,
          paymentReceivedEvent: true,
          refundSentEvent: true,
          donationReceivedEvent: true,
          ecommercePaymentReceivedEvent: true,
          ecommercePaymentCancelledEvent: true,
          ecommercePaymentExpiredEvent: true,
        },
        { timeout: 15000 }
      );

      console.log('🔔 Webhook subscribed:', listenerURL);
      return response.data;
    } catch (error: any) {
      console.error('❌ ATH Movil webhook subscription error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to subscribe webhook');
    }
  }

  isTestMode(): boolean {
    return this.publicToken.toLowerCase() === 'dummy';
  }
}

export const athMovilService = new ATHMovilService();
