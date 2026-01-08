import { Router, Request, Response } from 'express';
import { ATHMovilService } from '../services/athmovil';
import { storage } from '../services/storage';
import { GHLQueryRequest } from '../types';

const router = Router();

/**
 * POST /query
 * Este es el queryUrl que GHL llama para operaciones de pago
 *
 * Tipos de requests:
 * - verify: Verificar si un pago fue exitoso
 * - refund: Procesar un reembolso
 * - list_payment_methods: Listar metodos de pago guardados (no aplica para ATH Movil)
 * - charge_payment: Cobrar usando metodo guardado (no aplica para ATH Movil)
 */
router.post('/', async (req: Request, res: Response) => {
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

  // Buscar la transaccion en nuestro storage
  const transaction = transactionId
    ? storage.getTransactionByGHLId(transactionId)
    : storage.getTransaction(chargeId!);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  // Obtener credenciales de ATH Movil para esta location
  const location = storage.getLocation(locationId);
  const athMovil = new ATHMovilService(
    location?.athmovilPublicToken,
    location?.athmovilPrivateToken
  );

  // Consultar estado en ATH Movil
  const paymentStatus = await athMovil.findPayment(transaction.athmovilEcommerceId);

  const athStatus = paymentStatus.data.status;
  const isSuccess = athStatus === 'COMPLETED';

  // Actualizar nuestra transaccion
  if (isSuccess && transaction.status !== 'completed') {
    storage.updateTransactionStatus(
      transaction.id,
      'completed',
      paymentStatus.data.referenceNumber
    );
  } else if (athStatus === 'CANCEL') {
    storage.updateTransactionStatus(transaction.id, 'cancelled');
  } else if (athStatus === 'EXPIRED') {
    storage.updateTransactionStatus(transaction.id, 'expired');
  }

  return res.json({
    success: isSuccess,
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
    return res.status(400).json({
      success: false,
      message: 'chargeId is required',
    });
  }

  const transaction = storage.getTransaction(chargeId);
  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  if (!transaction.referenceNumber) {
    return res.status(400).json({
      success: false,
      message: 'Transaction has no reference number (payment may not be completed)',
    });
  }

  // Obtener credenciales de ATH Movil para esta location
  const location = storage.getLocation(locationId);
  const athMovil = new ATHMovilService(
    location?.athmovilPublicToken,
    location?.athmovilPrivateToken
  );

  const refundAmount = amount || transaction.amount;

  try {
    await athMovil.refundPayment(transaction.referenceNumber, refundAmount);

    // Actualizar estado
    storage.updateTransactionStatus(transaction.id, 'refunded');

    return res.json({
      success: true,
      refundId: `refund_${transaction.id}`,
      message: 'Refund processed successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process refund',
    });
  }
}

/**
 * Listar metodos de pago guardados
 * ATH Movil no soporta guardar metodos de pago
 */
function handleListPaymentMethods(res: Response) {
  // ATH Movil no guarda metodos de pago - cada pago requiere autorizacion en la app
  return res.json({
    success: true,
    paymentMethods: [],
    message: 'ATH Movil does not support saved payment methods',
  });
}

/**
 * Cobrar usando metodo guardado
 * ATH Movil no soporta esta funcionalidad
 */
function handleChargePayment(res: Response) {
  return res.status(400).json({
    success: false,
    message: 'ATH Movil does not support charging saved payment methods. Each payment requires customer authorization in the ATH Movil app.',
  });
}

/**
 * Crear suscripcion
 * ATH Movil no soporta pagos recurrentes automaticos
 */
function handleCreateSubscription(res: Response) {
  return res.status(400).json({
    success: false,
    message: 'ATH Movil does not support recurring subscriptions. Each payment requires customer authorization in the ATH Movil app.',
  });
}

export default router;
