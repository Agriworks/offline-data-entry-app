import AsyncStorage from '@react-native-async-storage/async-storage';

export type ErpSystem = {
  id: string;
  name: string;
  formCount: number;
};

type CachedErpPayload = {
  items: ErpSystem[];
  fetchedAt: number;
};

const ERP_CACHE_KEY = 'cachedErpSystems';

const isValidPayload = (value: unknown): value is CachedErpPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<CachedErpPayload>;
  return Array.isArray(payload.items);
};

export async function loadErpSystemsFromCache(): Promise<ErpSystem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(ERP_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isValidPayload(parsed)) {
      return null;
    }
    return parsed.items;
  } catch (error) {
    console.error('Failed to load cached ERP systems:', error);
    return null;
  }
}

export async function saveErpSystemsToCache(
  systems: ErpSystem[]
): Promise<void> {
  try {
    const payload: CachedErpPayload = {
      items: systems,
      fetchedAt: Date.now(),
    };
    await AsyncStorage.setItem(ERP_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to save ERP systems cache:', error);
  }
}

export async function clearErpSystemsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ERP_CACHE_KEY);
  } catch (error) {
    console.error('Failed to clear ERP systems cache:', error);
  }
}
