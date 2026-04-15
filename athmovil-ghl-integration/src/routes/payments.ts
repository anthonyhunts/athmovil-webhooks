import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ATHMovilService } from '../services/athmovil';
import { storage } from '../services/storage';
import { config } from '../config';
import { StoredTransaction } from '../types';

const router = Router();

/**
 * Normalizar estado de ATH Movil a minusculas
 */
function normalizeStatus(status: string): string {
  return status.toLowerCase();
}

/**
 * Validar request de inicio de pago
 */
function validateInitiateRequest(body: any): { valid: boolean; error?: string } {
  if (!body.locationId || typeof body.locationId !== 'string') {
    return { valid: false, error: 'locationId is required' };
  }
  if (!body.transactionId || typeof body.transactionId !== 'string') {
    return { valid: false, error: 'transactionId is required' };
  }
  if (typeof body.amount !== 'number' || body.amount < 1 || body.amount > 1500) {
    return { valid: false, error: 'amount must be a number between $1.00 and $1,500.00' };
  }
  if (body.phoneNumber) {
    const cleaned = String(body.phoneNumber).replace(/\D/g, '');
    if (cleaned.length !== 10) {
      return { valid: false, error: 'phoneNumber must be 10 digits' };
    }
  }
  return { valid: true };
}

/**
 * GET /payments/checkout
 * paymentsUrl - GHL carga esta pagina en un iframe
 */
router.get('/checkout', (req: Request, res: Response) => {
  const { locationId } = req.query;

  res.render('checkout', {
    title: 'Pagar con ATH Movil',
    locationId: locationId || '',
    baseUrl: config.baseUrl,
  });
});

/**
 * POST /payments/initiate
 * Inicia una transaccion de pago con ATH Movil
 */
router.post('/initiate', async (req: Request, res: Response) => {
  const validation = validateInitiateRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  const {
    locationId,
    transactionId,
    amount,
    productDetails,
    phoneNumber,
  } = req.body;

  console.log('💳 Payment initiate request:', { locationId, transactionId, amount });

  try {
    // Verificar que la location existe y tiene credenciales
    const location = storage.getLocation(locationId);
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location not configured. Please install the app first.',
      });
    }

    const athMovil = new ATHMovilService(
      location.athmovilPublicToken || config.athMovil.publicToken,
      location.athmovilPrivateToken || config.athMovil.privateToken
    );

    if (!athMovil.hasCredentials()) {
      return res.status(400).json({
        success: false,
        message: 'ATH Movil credentials not configured for this location.',
      });
    }

    // Crear pago en ATH Movil
    const athPayment = await athMovil.createPayment({
      total: amount,
      metadata1: transactionId, // GHL transactionId para matching
      metadata2: locationId,
      items: productDetails
        ? [{
            name: productDetails.name || 'Product',
            description: productDetails.description || '',
            quantity: 1,
            price: amount,
          }]
        : undefined,
      timeout: 600,
    });

    // Crear transaccion interna
    const internalTransaction: StoredTransaction = {
      id: uuidv4(),
      ghlTransactionId: transactionId,
      ghlLocationId: locationId,
      athmovilEcommerceId: athPayment.data.ecommerceId,
      athmovilAuthToken: athPayment.data.auth_token,
      amount,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    storage.saveTransaction(internalTransaction);

    // Enviar push notification si tenemos numero de telefono
    if (phoneNumber) {
      const cleanPhone = String(phoneNumber).replace(/\D/g, '');
      try {
        await athMovil.updatePhoneNumber(
          athPayment.data.ecommerceId,
          cleanPhone,
          athPayment.data.auth_token
        );
      } catch (e) {
        console.warn('⚠️ Could not send push notification:', e);
      }
    }

    res.json({
      success: true,
      chargeId: internalTransaction.id,
      ecommerceId: athPayment.data.ecommerceId,
      authToken: athPayment.data.auth_token,
    });
  } catch (error: any) {
    console.error('❌ Payment initiate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate payment',
    });
  }
});

/**
 * POST /payments/status
 * Consulta el estado de un pago (usado por polling del checkout)
 */
router.post('/status', async (req: Request, res: Response) => {
  const { chargeId, ecommerceId, locationId } = req.body;

  if (!chargeId && !ecommerceId) {
    return res.status(400).json({ success: false, message: 'chargeId or ecommerceId required' });
  }

  try {
    const transaction = chargeId
      ? storage.getTransaction(chargeId)
      : storage.getTransactionByATHMovilId(ecommerceId);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Si ya esta en estado final, retornar sin consultar ATH Movil
    if (['completed', 'cancelled', 'expired', 'refunded'].includes(transaction.status)) {
      return res.json({
        success: true,
        chargeId: transaction.id,
        status: transaction.status,
        referenceNumber: transaction.referenceNumber,
      });
    }

    // Consultar ATH Movil
    const resolvedLocationId = locationId || transaction.ghlLocationId;
    const location = storage.getLocation(resolvedLocationId);
    const athMovil = new ATHMovilService(
      location?.athmovilPublicToken,
      location?.athmovilPrivateToken
    );

    const athResult = await athMovil.findPayment(transaction.athmovilEcommerceId);
    const athStatus = normalizeStatus(athResult.data.status);

    let finalStatus: string = 'pending';

    if (athStatus === 'completed') {
      finalStatus = 'completed';
      storage.updateTransactionStatus(transaction.id, 'completed', athResult.data.referenceNumber);
    } else if (athStatus === 'cancel') {
      finalStatus = 'cancelled';
      storage.updateTransactionStatus(transaction.id, 'cancelled');
    } else if (athStatus === 'expired') {
      finalStatus = 'expired';
      storage.updateTransactionStatus(transaction.id, 'expired');
    }

    res.json({
      success: true,
      chargeId: transaction.id,
      status: finalStatus,
      referenceNumber: athResult.data.referenceNumber,
    });
  } catch (error: any) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get payment status',
    });
  }
});

export default router;
