import { AppStorage, StoredLocation, StoredTransaction } from '../types';

/**
 * Simple in-memory storage
 *
 * ⚠️ IMPORTANTE: En produccion debes reemplazar esto con una base de datos real
 * Opciones recomendadas:
 * - PostgreSQL
 * - MongoDB
 * - Redis (para cache)
 *
 * Este storage se pierde cuando el servidor se reinicia
 */
class Storage implements AppStorage {
  locations: Map<string, StoredLocation> = new Map();
  transactions: Map<string, StoredTransaction> = new Map();

  // ==========================================
  // LOCATIONS (GHL Sub-accounts)
  // ==========================================

  saveLocation(location: StoredLocation): void {
    this.locations.set(location.locationId, location);
    console.log('💾 Location saved:', location.locationId);
  }

  getLocation(locationId: string): StoredLocation | undefined {
    return this.locations.get(locationId);
  }

  getLocationByCompanyId(companyId: string): StoredLocation | undefined {
    for (const location of this.locations.values()) {
      if (location.companyId === companyId) {
        return location;
      }
    }
    return undefined;
  }

  deleteLocation(locationId: string): boolean {
    const result = this.locations.delete(locationId);
    if (result) {
      console.log('🗑️ Location deleted:', locationId);
    }
    return result;
  }

  getAllLocations(): StoredLocation[] {
    return Array.from(this.locations.values());
  }

  // ==========================================
  // TRANSACTIONS
  // ==========================================

  saveTransaction(transaction: StoredTransaction): void {
    this.transactions.set(transaction.id, transaction);
    console.log('💾 Transaction saved:', transaction.id, '->', transaction.status);
  }

  getTransaction(id: string): StoredTransaction | undefined {
    return this.transactions.get(id);
  }

  getTransactionByGHLId(ghlTransactionId: string): StoredTransaction | undefined {
    for (const tx of this.transactions.values()) {
      if (tx.ghlTransactionId === ghlTransactionId) {
        return tx;
      }
    }
    return undefined;
  }

  getTransactionByATHMovilId(athmovilEcommerceId: string): StoredTransaction | undefined {
    for (const tx of this.transactions.values()) {
      if (tx.athmovilEcommerceId === athmovilEcommerceId) {
        return tx;
      }
    }
    return undefined;
  }

  updateTransactionStatus(
    id: string,
    status: StoredTransaction['status'],
    referenceNumber?: string
  ): StoredTransaction | undefined {
    const tx = this.transactions.get(id);
    if (tx) {
      tx.status = status;
      tx.updatedAt = new Date();
      if (referenceNumber) {
        tx.referenceNumber = referenceNumber;
      }
      this.transactions.set(id, tx);
      console.log('📝 Transaction updated:', id, '->', status);
    }
    return tx;
  }

  getTransactionsByLocation(locationId: string): StoredTransaction[] {
    return Array.from(this.transactions.values()).filter(
      tx => tx.ghlLocationId === locationId
    );
  }

  // ==========================================
  // UTILITY
  // ==========================================

  clearAll(): void {
    this.locations.clear();
    this.transactions.clear();
    console.log('🧹 Storage cleared');
  }

  getStats(): { locations: number; transactions: number } {
    return {
      locations: this.locations.size,
      transactions: this.transactions.size,
    };
  }
}

// Singleton
export const storage = new Storage();
