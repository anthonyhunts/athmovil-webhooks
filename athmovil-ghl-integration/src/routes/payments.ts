import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ATHMovilService } from '../services/athmovil';
import { storage } from '../services/storage';
import { config } from '../config';
import { StoredTransaction } from '../types';

const router = Router();

/**
 * GET /payments/checkout
 * Esta es la paymentsUrl - GHL carga esta pagina en un iframe
 * Recibe los datos del pago via postMessage
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
 * Llamado desde el checkout via JavaScript
 */
router.post('/initiate', async (req: Request, res: Response) => {
  const {
    locationId,
    transactionId, // GHL transaction ID
    amount,
    currency,
    productDetails,
    contact,
    phoneNumber,
  } = req.body;

  console.log('💳 Payment initiate request:', { locationId, transactionId, amount });

  try {
    // Verificar que la location existe
    const location = storage.getLocation(locationId);
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location not configured. Please install the app first.',
      });
    }

    // Crear servicio ATH Movil con credenciales de la location
    const athMovil = new ATHMovilService(
      location.athmovilPublicToken || config.athMovil.publicToken,
      location.athmovilPrivateToken || config.athMovil.privateToken
    );

    // Crear pago en ATH Movil
    const athPayment = await athMovil.createPayment({
      total: amount,
      metadata1: transactionId, // Guardar GHL transactionId para matching
      metadata2: locationId,
      items: productDetails
        ? [
            {
              name: productDetails.name || 'Product',
              description: productDetails.description || '',
              quantity: 1,
              price: amount,
            },
          ]
        : undefined,
      timeout: 600, // 10 minutos
    });

    // Crear nuestra transaccion interna
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

    // Si tenemos numero de telefono, enviamos la notificacion push
    if (phoneNumber) {
      try {
        await athMovil.updatePhoneNumber(
          athPayment.data.ecommerceId,
          phoneNumber,
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
 * Consulta el estado de un pago
 */
router.post('/status', async (req: Request, res: Response) => {
  const { chargeId, ecommerceId, locationId } = req.body;

  try {
    const transaction = chargeId
      ? storage.getTransaction(chargeId)
      : storage.getTransactionByATHMovilId(ecommerceId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Obtener credenciales de ATH Movil
    const location = storage.getLocation(locationId || transaction.ghlLocationId);
    const athMovil = new ATHMovilService(
      location?.athmovilPublicToken,
      location?.athmovilPrivateToken
    );

    // Consultar ATH Movil
    const athStatus = await athMovil.findPayment(transaction.athmovilEcommerceId);

    const status = athStatus.data.status;
    const isCompleted = status === 'COMPLETED';
    const isCancelled = status === 'CANCEL';
    const isExpired = status === 'EXPIRED';

    // Actualizar nuestro estado si es necesario
    if (isCompleted && transaction.status !== 'completed') {
      storage.updateTransactionStatus(
        transaction.id,
        'completed',
        athStatus.data.referenceNumber
      );
    } else if (isCancelled && transaction.status !== 'cancelled') {
      storage.updateTransactionStatus(transaction.id, 'cancelled');
    } else if (isExpired && transaction.status !== 'expired') {
      storage.updateTransactionStatus(transaction.id, 'expired');
    }

    res.json({
      success: true,
      chargeId: transaction.id,
      status: isCompleted ? 'completed' : isCancelled ? 'cancelled' : isExpired ? 'expired' : 'pending',
      athmovilStatus: status,
      referenceNumber: athStatus.data.referenceNumber,
    });
  } catch (error: any) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get payment status',
    });
  }
});

/**
 * POST /payments/confirm
 * Confirmar que el pago fue completado (llamado desde checkout)
 */
router.post('/confirm', async (req: Request, res: Response) => {
  const { chargeId } = req.body;

  const transaction = storage.getTransaction(chargeId);
  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  // Obtener estado actualizado
  const location = storage.getLocation(transaction.ghlLocationId);
  const athMovil = new ATHMovilService(
    location?.athmovilPublicToken,
    location?.athmovilPrivateToken
  );

  try {
    const athStatus = await athMovil.findPayment(transaction.athmovilEcommerceId);

    if (athStatus.data.status === 'COMPLETED') {
      storage.updateTransactionStatus(
        transaction.id,
        'completed',
        athStatus.data.referenceNumber
      );

      return res.json({
        success: true,
        chargeId: transaction.id,
        referenceNumber: athStatus.data.referenceNumber,
      });
    } else {
      return res.json({
        success: false,
        chargeId: transaction.id,
        status: athStatus.data.status,
        message: `Payment status: ${athStatus.data.status}`,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
