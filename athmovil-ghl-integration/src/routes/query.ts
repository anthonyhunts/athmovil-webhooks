import { Router, Request, Response } from 'express';
import { ATHMovilService } from '../services/athmovil';
import { storage } from '../services/storage';
import { GHLQueryRequest } from '../types';

const router = Router();

/**
 * Normalizar estado de ATH Movil a minusculas
 */
function normalizeStatus(status: string): string {
  return status.toLowerCase();
}

/**
 * Validar un GHL query request basico
 */
function validateQueryRequest(body: any): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  if (!body.type || typeof body.type !== 'string') {
    return { valid: false, error: 'type is required' };
  }
  if (!body.locationId || typeof body.locationId !== 'string') {
    return { valid: false, error: 'locationId is required' };
  }
  return { valid: true };
}

/**
 * Obtener ATHMovilService con credenciales de la location
 */
function getATHMovilForLocation(locationId: string): ATHMovilService {
  const location = storage.getLocation(locationId);
  const service = new ATHMovilService(
    location?.athmovilPublicToken,
    location?.athmovilPrivateToken
  );

  if (!service.hasCredentials()) {
    throw new Error('ATH Movil credentials not configured for this location');
  }

  return service;
}

/**
 * POST /query
 * Este es el queryUrl que GHL llama para operaciones de pago
 */
router.post('/', async (req: Request, res: Response) => {
  const validation = validateQueryRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  const queryRequest = req.body as GHLQueryRequest;

  console.log('📥 Query request received:', queryRequest.type, 'for location:', queryRequest.locationId);

  try {
    switch (queryRequest.type) {
      case 'verify':
        return await handleVerify(queryRequest, res);

      case 'refund':
        return await handleRefund(queryRequest, res);

      case 'list_payment_methods':
        return handleListPaymentMethods(res);

      case 'charge_payment':
        return handleChargePayment(res);

      case 'create_subscription':
        return handleCreateSubscription(res);

      default:
        console.warn('⚠️ Unknown query type:', queryRequest.type);
        return res.status(400).json({
          success: false,
          message: `Unknown query type: ${queryRequest.type}`,
        });
    }
  } catch (error: any) {
    console.error('❌ Query error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

/**
 * Verificar estado de un pago
 */
async function handleVerify(query: GHLQueryRequest, res: Response) {
  const { transactionId, chargeId, locationId } = query;

  if (!transactionId && !chargeId) {
    return res.status(400).json({
      success: false,
      message: 'transactionId or chargeId is required',
    });
  }

  const transaction = transactionId
    ? storage.getTransactionByGHLId(transactionId)
    : storage.getTransaction(chargeId!);

  if (!transaction) {
    return res.json({ success: false, message: 'Transaction not found' });
  }

  const athMovil = getATHMovilForLocation(locationId);
  const paymentStatus = await athMovil.findPayment(transaction.athmovilEcommerceId);
  const athStatus = normalizeStatus(paymentStatus.data.status);

  if (athStatus === 'completed' && transaction.status !== 'completed') {
    storage.updateTransactionStatus(transaction.id, 'completed', paymentStatus.data.referenceNumber);
  } else if (athStatus === 'cancel' && transaction.status !== 'cancelled') {
    storage.updateTransactionStatus(transaction.id, 'cancelled');
  } else if (athStatus === 'expired' && transaction.status !== 'expired') {
    storage.updateTransactionStatus(transaction.id, 'expired');
  }

  const isSuccess = athStatus === 'completed';

  return res.json({
    success: isSuccess,
    ...(isSuccess ? {} : { failed: athStatus === 'cancel' || athStatus === 'expired' }),
    chargeId: transaction.id,
    message: isSuccess ? 'Payment verified successfully' : `Payment status: ${athStatus}`,
    chargeSnapshot: isSuccess
      ? {
          id: transaction.id,
          status: 'succeeded',
          amount: transaction.amount,
          chargeId: transaction.id,
          chargedAt: new Date().toISOString(),
        }
      : undefined,
  });
}

/**
 * Procesar reembolso
 */
async function handleRefund(query: GHLQueryRequest, res: Response) {
  const { chargeId, amount, locationId } = query;

  if (!chargeId) {
    return res.status(400).json({ success: false, message: 'chargeId is required' });
  }

  const transaction = storage.getTransaction(chargeId);
  if (!transaction) {
    return res.status(404).json({ success: false, message: 'Transaction not found' });
  }

  if (!transaction.referenceNumber) {
    return res.status(400).json({
      success: false,
      message: 'Transaction has no reference number (payment may not be completed)',
    });
  }

  const refundAmount = amount || transaction.amount;
  if (refundAmount <= 0 || refundAmount > transaction.amount) {
    return res.status(400).json({
      success: false,
      message: `Invalid refund amount. Must be between $0.01 and $${transaction.amount}`,
    });
  }

  const athMovil = getATHMovilForLocation(locationId);

  await athMovil.refundPayment(transaction.referenceNumber, refundAmount);
  storage.updateTransactionStatus(transaction.id, 'refunded');

  return res.json({
    success: true,
    refundId: `refund_${transaction.id}`,
    message: 'Refund processed successfully',
  });
}

/**
 * ATH Movil no soporta metodos de pago guardados
 */
function handleListPaymentMethods(res: Response) {
  return res.json({ success: true, paymentMethods: [] });
}

/**
 * ATH Movil no soporta cobros con metodo guardado
 */
function handleChargePayment(res: Response) {
  return res.status(400).json({
    success: false,
    message: 'ATH Movil does not support charging saved payment methods.',
  });
}

/**
 * ATH Movil no soporta suscripciones recurrentes
 */
function handleCreateSubscription(res: Response) {
  return res.status(400).json({
    success: false,
    message: 'ATH Movil does not support recurring subscriptions.',
  });
}

export default router;
