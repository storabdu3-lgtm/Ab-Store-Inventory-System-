import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  runTransaction,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";

export const COLLECTIONS = {
  PRODUCTS: "products",
  CATEGORIES: "categories",
  STORES: "stores",
  SUPPLIERS: "suppliers",
  CUSTOMERS: "customers",
  STOCK_IN: "stock_in",
  POS_SALES: "pos_sales",
  ORDER_VOUCHERS: "order_vouchers",
  TRANSFERS: "transfers",
  DAMAGE_RETURNS: "damage_returns",
  EXPENSES: "expenses",
  PRICING: "pricing",
  STORE_BALANCE: "store_balance",
  BINCARD: "bincard",
  SUPPLIER_PAYMENTS: "supplier_payments",
  CUSTOMER_PAYMENTS: "customer_payments",
  PRODUCT_REQUESTS: "product_requests",
  STORE_REQUESTS: "store_requests",
  ACCOUNTS: "accounts",
  ACCOUNT_VOUCHERS: "account_vouchers",
  PROMOTIONS: "promotions",
  DIRECT_SALES: "direct_sales",
  APP_SETTINGS: "app_settings",
  USERS: "users",
  BINNING: "binning",
  SYSTEMS: "systems",
  COUNTERS: "counters",
} as const;

// --- LocalStorage Fallback Helpers ---
function getLocalCollection<T>(collectionName: string): T[] {
  try {
    const raw = localStorage.getItem(`nexus_db_${collectionName}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalCollection<T>(collectionName: string, items: T[]): void {
  try {
    localStorage.setItem(`nexus_db_${collectionName}`, JSON.stringify(items));
  } catch (err) {
    console.warn("Failed to write to local storage:", err);
  }
}

export function generateVoucherId(prefix: string): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const time = String(now.getTime()).slice(-5);
  return `${prefix}-${year}${month}${day}-${time}`;
}

/** Generates a sequential serial voucher ID like POS-00001, POS-00002 … */
export async function generateSerialVoucherId(prefix: string): Promise<string> {
  try {
    const counterRef = doc(db, "counters", prefix);
    const newCount = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      const current: number = snap.exists() ? (snap.data().count as number) || 0 : 0;
      const next = current + 1;
      transaction.set(counterRef, { count: next }, { merge: true });
      return next;
    });
    localStorage.setItem(`nexus_counter_${prefix}`, String(newCount));
    return `${prefix}-${String(newCount).padStart(5, "0")}`;
  } catch (err) {
    console.warn(`Firestore counter failed for ${prefix}, using local fallback:`, err);
    const prevStr = localStorage.getItem(`nexus_counter_${prefix}`) || "0";
    const nextCount = parseInt(prevStr, 10) + 1;
    localStorage.setItem(`nexus_counter_${prefix}`, String(nextCount));
    return `${prefix}-${String(nextCount).padStart(5, "0")}`;
  }
}

export async function getAll<T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  try {
    const q = constraints.length > 0
      ? query(collection(db, collectionName), ...constraints)
      : collection(db, collectionName);
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
    if (docs.length > 0) {
      setLocalCollection(collectionName, docs);
    }
    const local = getLocalCollection<T>(collectionName);
    return docs.length > 0 ? docs : local;
  } catch (err) {
    console.warn(`Firestore getAll failed for ${collectionName}, using local storage:`, err);
    return getLocalCollection<T>(collectionName);
  }
}

export async function getById<T>(collectionName: string, id: string): Promise<T | null> {
  try {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
  } catch (err) {
    console.warn(`Firestore getById failed for ${collectionName}/${id}, using local storage:`, err);
  }
  const localItems = getLocalCollection<{ id: string } & T>(collectionName);
  return localItems.find(item => item.id === id) || null;
}

export async function create<T extends Record<string, unknown>>(
  collectionName: string,
  data: T
): Promise<string> {
  const now = new Date().toISOString();
  const payload = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  let newId = `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    newId = docRef.id;
  } catch (err) {
    console.warn(`Firestore create failed for ${collectionName}, saving to local storage:`, err);
  }

  const items = getLocalCollection<Record<string, unknown>>(collectionName);
  items.unshift({ id: newId, ...payload });
  setLocalCollection(collectionName, items);

  return newId;
}

export async function createWithId<T extends Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: T
): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = doc(db, collectionName, id);
    await setDoc(docRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn(`Firestore createWithId failed for ${collectionName}/${id}, saving to local storage:`, err);
  }

  const items = getLocalCollection<Record<string, unknown>>(collectionName);
  const existingIndex = items.findIndex(item => item.id === id);
  if (existingIndex >= 0) {
    items[existingIndex] = { id, ...payload };
  } else {
    items.unshift({ id, ...payload });
  }
  setLocalCollection(collectionName, items);
}

export async function update<T extends Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn(`Firestore update failed for ${collectionName}/${id}, updating in local storage:`, err);
  }

  const items = getLocalCollection<Record<string, unknown>>(collectionName);
  const index = items.findIndex(item => item.id === id);
  if (index >= 0) {
    items[index] = { ...items[index], ...data, updatedAt: now };
    setLocalCollection(collectionName, items);
  }
}

export async function remove(collectionName: string, id: string): Promise<void> {
  try {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn(`Firestore remove failed for ${collectionName}/${id}, deleting from local storage:`, err);
  }

  const items = getLocalCollection<{ id: string }>(collectionName);
  const filtered = items.filter(item => item.id !== id);
  setLocalCollection(collectionName, filtered);
}

/** Propagates updated product info across collections */
export async function syncProductAcrossCollections(
  productId: string,
  info: { name: string; code: string; photoUrl?: string; categoryName?: string; quantityPerCarton?: number }
): Promise<void> {
  const itemCollections = [
    COLLECTIONS.STOCK_IN,
    COLLECTIONS.POS_SALES,
    COLLECTIONS.TRANSFERS,
    COLLECTIONS.DAMAGE_RETURNS,
    COLLECTIONS.STORE_REQUESTS,
    COLLECTIONS.BINNING,
    COLLECTIONS.DIRECT_SALES,
  ];

  // Sync in local storage
  for (const colName of itemCollections) {
    const items = getLocalCollection<Record<string, unknown>>(colName);
    let collectionUpdated = false;
    const updatedDocs = items.map(docData => {
      const docItems = docData.items as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(docItems)) return docData;
      let changed = false;
      const newDocItems = docItems.map(it => {
        if (it.productId !== productId) return it;
        changed = true;
        const updatedItem: Record<string, unknown> = {
          ...it,
          productName: info.name,
          productCode: info.code,
        };
        if ("photoUrl" in it && info.photoUrl !== undefined) updatedItem.photoUrl = info.photoUrl;
        if ("categoryName" in it && info.categoryName !== undefined) updatedItem.categoryName = info.categoryName;
        if ("quantityPerCarton" in it && info.quantityPerCarton !== undefined) updatedItem.quantityPerCarton = info.quantityPerCarton;
        return updatedItem;
      });
      if (changed) {
        collectionUpdated = true;
        return { ...docData, items: newDocItems };
      }
      return docData;
    });
    if (collectionUpdated) {
      setLocalCollection(colName, updatedDocs);
    }
  }

  // Sync STORE_BALANCE in local storage
  const balances = getLocalCollection<Record<string, unknown>>(COLLECTIONS.STORE_BALANCE);
  let balancesUpdated = false;
  const updatedBalances = balances.map(b => {
    if (b.productId === productId) {
      balancesUpdated = true;
      const updated: Record<string, unknown> = { ...b, productName: info.name, productCode: info.code };
      if ("photoUrl" in b && info.photoUrl !== undefined) updated.photoUrl = info.photoUrl;
      return updated;
    }
    return b;
  });
  if (balancesUpdated) {
    setLocalCollection(COLLECTIONS.STORE_BALANCE, updatedBalances);
  }

  try {
    type PendingUpdate = { ref: ReturnType<typeof doc>; data: Record<string, unknown> };
    const pending: PendingUpdate[] = [];

    for (const colName of itemCollections) {
      const snapshot = await getDocs(collection(db, colName));
      for (const d of snapshot.docs) {
        const raw = d.data() as Record<string, unknown>;
        const items = raw.items as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(items)) continue;
        let changed = false;
        const newItems = items.map(it => {
          if (it.productId !== productId) return it;
          changed = true;
          const updatedItem: Record<string, unknown> = {
            ...it,
            productName: info.name,
            productCode: info.code,
          };
          if ("photoUrl" in it && info.photoUrl !== undefined) updatedItem.photoUrl = info.photoUrl;
          if ("categoryName" in it && info.categoryName !== undefined) updatedItem.categoryName = info.categoryName;
          if ("quantityPerCarton" in it && info.quantityPerCarton !== undefined) updatedItem.quantityPerCarton = info.quantityPerCarton;
          return updatedItem;
        });
        if (changed) {
          pending.push({ ref: doc(db, colName, d.id), data: { items: newItems } });
        }
      }
    }

    const balanceSnapshot = await getDocs(collection(db, COLLECTIONS.STORE_BALANCE));
    for (const d of balanceSnapshot.docs) {
      const raw = d.data() as Record<string, unknown>;
      if (raw.productId !== productId) continue;
      const updatedData: Record<string, unknown> = { productName: info.name, productCode: info.code };
      if ("photoUrl" in raw && info.photoUrl !== undefined) updatedData.photoUrl = info.photoUrl;
      pending.push({ ref: doc(db, COLLECTIONS.STORE_BALANCE, d.id), data: updatedData });
    }

    const batchSize = 450;
    for (let i = 0; i < pending.length; i += batchSize) {
      const chunk = pending.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const { ref, data } of chunk) batch.update(ref, data);
      await batch.commit();
    }
  } catch (err) {
    console.warn("Firestore syncProductAcrossCollections failed:", err);
  }
}

export async function clearCollection(collectionName: string): Promise<void> {
  localStorage.removeItem(`nexus_db_${collectionName}`);
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    const batchSize = 500;
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snapshot.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  } catch (err) {
    console.warn(`Firestore clearCollection failed for ${collectionName}:`, err);
  }
}

export {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  runTransaction,
  Timestamp,
};

export { db };
