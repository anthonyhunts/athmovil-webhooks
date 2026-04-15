import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from '../services/storage';
import { ghlService } from '../services/ghl';
import { ATHMovilWebhookPayload } from '../types';

const router = Router();

/**
 * Normalizar estado de ATH Movil a minusculas
 */
function normalizeStatus(status: string): string {
  return status.toLowerCase();
}

/**
 * Verificar que un webhook de ATH Movil es valido.
 * ATH Movil no proporciona firmas HMAC, asi que verificamos contra
 * nuestras transacciones existentes para confirmar legitimidad.
 */
function verifyATHMovilWebhook(payload: ATHMovilWebhookPayload): boolean {
  if (!payload.transactionType || !payload.status) {
    return false;
  }

  // Si tiene ecommerceId, verificar que existe en nuestro sistema
  if (payload.ecommerceId) {
    const transaction = storage.getTransactionByATHMovilId(payload.ecommerceId);
    if (!transaction) {
      console.warn('⚠️ Webhook for unknown ecommerceId:', payload.ecommerceId);
      return false;
    }
  }

  // Si tiene metadata1 (nuestro GHL transactionId), verificar
  if (payload.metadata1 && !payload.ecommerceId) {
    const transaction = storage.getTransactionByGHLId(payload.metadata1);
    if (!transaction) {
      console.warn('⚠️ Webhook for unknown GHL transactionId:', payload.metadata1);
      return false;
    }
  }

  return true;
}

/**
 * POST /webhooks/athmovil
 * Recibe notificaciones de ATH Movil sobre eventos de pago
 */
router.post('/athmovil', async (req: Request, res: Response) => {
  const payload = req.body as ATHMovilWebhookPayload;

  console.log('🔔 ATH Movil webhook received:', payload.transactionType, '->', payload.status);

  // Verificar legitimidad basica
  if (!verifyATHMovilWebhook(payload)) {
    console.warn('⚠️ Webhook verification failed, ignoring');
    return res.status(200).json({ received: true, verified: false });
  }

  try {
    // Buscar la transaccion
    let transaction = payload.ecommerceId
      ? storage.getTransactionByATHMovilId(payload.ecommerceId)
      : undefined;

    if (!transaction && payload.metadata1) {
      transaction = storage.getTransactionByGHLId(payload.metadata1);
    }

    if (!transaction) {
      return res.status(200).json({ received: true, matched: false });
    }

    // Prevenir procesamiento duplicado
    if (
      transaction.status === 'completed' ||
      transaction.status === 'refunded'
    ) {
      console.log('ℹ️ Transaction already in final state:', transaction.id, transaction.status);
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }

    const status = normalizeStatus(payload.status);

    if (status === 'completed') {
      storage.updateTransactionStatus(
        transaction.id,
        'completed',
        payload.referenceNumber
      );

      await ghlService.notifyTransactionResult(
        transaction.ghlLocationId,
        transaction.ghlTransactionId,
        { success: true, chargeId: transaction.id }
      );

      console.log('✅ Payment completed:', transaction.id);
    } else if (status === 'cancel' || status === 'cancelled') {
      storage.updateTransactionStatus(transaction.id, 'cancelled');

      await ghlService.notifyTransactionResult(
        transaction.ghlLocationId,
        transaction.ghlTransactionId,
        { success: false, message: 'Payment cancelled by user' }
      );

      console.log('❌ Payment cancelled:', transaction.id);
    } else if (status === 'expired') {
      storage.updateTransactionStatus(transaction.id, 'expired');

      await ghlService.notifyTransactionResult(
        transaction.ghlLocationId,
        transaction.ghlTransactionId,
        { success: false, message: 'Payment expired' }
      );

      console.log('⏰ Payment expired:', transaction.id);
    }

    res.status(200).json({ received: true, matched: true, transactionId: transaction.id });
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * POST /webhooks/ghl
 * Recibe webhooks de Go High Level
 */
router.post('/ghl', async (req: Request, res: Response) => {
  const { type, locationId } = req.body;

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
