import { Router, Request, Response } from 'express';
import { storage } from '../services/storage';
import { ghlService } from '../services/ghl';
import { ATHMovilWebhookPayload } from '../types';

const router = Router();

/**
 * POST /webhooks/athmovil
 * Recibe notificaciones de ATH Movil sobre eventos de pago
 *
 * Eventos soportados:
 * - ecommerce (completed, cancelled, expired)
 * - payment (completed)
 * - refund (completed)
 * - donation (completed)
 */
router.post('/athmovil', async (req: Request, res: Response) => {
  const payload = req.body as ATHMovilWebhookPayload;

  console.log('🔔 ATH Movil webhook received:', payload.transactionType, '->', payload.status);

  try {
    // Buscar la transaccion por ecommerceId o metadata
    let transaction = payload.ecommerceId
      ? storage.getTransactionByATHMovilId(payload.ecommerceId)
      : undefined;

    // Tambien buscar por metadata1 si contiene el GHL transactionId
    if (!transaction && payload.metadata1) {
      transaction = storage.getTransactionByGHLId(payload.metadata1);
    }

    if (!transaction) {
      console.warn('⚠️ Transaction not found for webhook:', payload.ecommerceId || payload.referenceNumber);
      // Aun asi respondemos 200 para que ATH Movil no reintente
      return res.status(200).json({ received: true, matched: false });
    }

    // Procesar segun el tipo y estado
    const status = payload.status.toLowerCase();
    const type = payload.transactionType.toLowerCase();

    if (status === 'completed') {
      // Pago completado
      storage.updateTransactionStatus(
        transaction.id,
        'completed',
        payload.referenceNumber
      );

      // Notificar a GHL
      const location = storage.getLocation(transaction.ghlLocationId);
      if (location) {
        await ghlService.notifyTransactionResult(
          transaction.ghlLocationId,
          location.accessToken,
          transaction.ghlTransactionId,
          {
            success: true,
            chargeId: transaction.id,
          }
        );
      }

      console.log('✅ Payment completed:', transaction.id);
    } else if (status === 'cancel' || status === 'cancelled') {
      // Pago cancelado por el usuario
      storage.updateTransactionStatus(transaction.id, 'cancelled');

      const location = storage.getLocation(transaction.ghlLocationId);
      if (location) {
        await ghlService.notifyTransactionResult(
          transaction.ghlLocationId,
          location.accessToken,
          transaction.ghlTransactionId,
          {
            success: false,
            message: 'Payment cancelled by user',
          }
        );
      }

      console.log('❌ Payment cancelled:', transaction.id);
    } else if (status === 'expired') {
      // Pago expirado (timeout)
      storage.updateTransactionStatus(transaction.id, 'expired');

      const location = storage.getLocation(transaction.ghlLocationId);
      if (location) {
        await ghlService.notifyTransactionResult(
          transaction.ghlLocationId,
          location.accessToken,
          transaction.ghlTransactionId,
          {
            success: false,
            message: 'Payment expired',
          }
        );
      }

      console.log('⏰ Payment expired:', transaction.id);
    }

    // Responder exitosamente
    res.status(200).json({ received: true, matched: true, transactionId: transaction.id });
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);
    // Aun respondemos 200 para evitar reintentos
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * POST /webhooks/ghl
 * Recibe webhooks de Go High Level (instalacion, desinstalacion, etc)
 */
router.post('/ghl', async (req: Request, res: Response) => {
  const { type, locationId, data } = req.body;

  console.log('🔔 GHL webhook received:', type);

  switch (type) {
    case 'app.installed':
      console.log('📥 App installed on location:', locationId);
      break;

    case 'app.uninstalled':
      if (locationId) {
        storage.deleteLocation(locationId);
        console.log('📤 App uninstalled from location:', locationId);
      }
      break;

    default:
      console.log('ℹ️ Unhandled webhook type:', type);
  }

  res.status(200).json({ received: true });
});

export default router;
