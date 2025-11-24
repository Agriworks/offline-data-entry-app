import AsyncStorage from '@react-native-async-storage/async-storage';
import { DocType, Field, FormItem, RawField } from './types';
import { getDoctypeByName, getLinkOptions } from './lib/hey-api/client/sdk.gen';

const DOCTYPE_PREFIX = 'doctype:';
const DOCTYPE_INDEX_KEY = 'doctypeIndex';
const LEGACY_STORAGE_KEY = 'downloadDoctypes';
const LINK_OPTIONS_PREFIX = 'linkOptions:';

type DependencyType = 'link' | 'table';
type OriginType = 'root' | DependencyType;

export type StoredDependency = {
  name: string;
  via: DependencyType;
  fieldname: string;
};

export type StoredDoctype = {
  name: string;
  payload: DocType;
  dependencies: StoredDependency[];
  origin?: OriginType;
  fetchedAt: number;
};

type DoctypeIndexPayload = {
  items: string[];
  updatedAt: number;
};

type QueueNode = {
  name: string;
  via: OriginType;
  fieldname?: string | null;
};

type EnsureDoctypeOptions = {
  networkAvailable?: boolean;
  forceRefresh?: boolean;
  fetcher?: (name: string) => Promise<DocType>;
};

export type EnsureDoctypeResult = {
  ensured: string[];
  fetched: string[];
  skipped: string[];
  errors: Array<{ name: string; error: unknown }>;
};

let isLegacyMigrated = false;
let cachedIndex: Set<string> | null = null;

const normalizeDoctypeName = (name: string): string => name.trim();
const visitedKeyFor = (name: string): string =>
  normalizeDoctypeName(name).toLowerCase();
const storageKeyFor = (name: string): string =>
  `${DOCTYPE_PREFIX}${normalizeDoctypeName(name)}`;

const parseJson = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Failed to parse JSON from storage:', error);
    return null;
  }
};

const serialize = (value: unknown): string => JSON.stringify(value);

const extractDependencies = (docType: DocType): StoredDependency[] => {
  const uniqueMap = new Map<string, StoredDependency>();

  docType.fields.forEach(field => {
    if (!field) {
      return;
    }

    const isHiddenField = (value: unknown): boolean =>
      value === 1 || value === '1' || value === true;

    if (
      isHiddenField(field.hidden) ||
      isHiddenField(field.print_hide) ||
      isHiddenField(field.report_hide)
    ) {
      return;
    }

    const options =
      typeof field.options === 'string' ? field.options.trim() : '';
    if (!options) {
      return;
    }

    if (field.fieldtype === 'Link') {
      const normalized = normalizeDoctypeName(options);
      const key = visitedKeyFor(normalized);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          name: normalized,
          via: 'link',
          fieldname: field.fieldname,
        });
      }
      return;
    }

    if (field.fieldtype === 'Table') {
      const normalized = normalizeDoctypeName(options);
      const key = visitedKeyFor(normalized);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          name: normalized,
          via: 'table',
          fieldname: field.fieldname,
        });
      }
    }
  });

  return Array.from(uniqueMap.values());
};

const loadIndexSet = async (): Promise<Set<string>> => {
  if (cachedIndex) {
    return cachedIndex;
  }
  const raw = await AsyncStorage.getItem(DOCTYPE_INDEX_KEY);
  if (!raw) {
    cachedIndex = new Set();
    return cachedIndex;
  }

  let parsed = parseJson<DoctypeIndexPayload | string[]>(raw);
  if (!parsed) {
    cachedIndex = new Set();
    return cachedIndex;
  }

  let items: string[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (Array.isArray(parsed.items)) {
    items = parsed.items;
  }

  cachedIndex = new Set(items.map(normalizeDoctypeName).filter(Boolean));
  return cachedIndex;
};

const persistIndexSet = async (set: Set<string>): Promise<void> => {
  cachedIndex = set;
  const items = Array.from(set.values());
  const payload: DoctypeIndexPayload = {
    items,
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(DOCTYPE_INDEX_KEY, serialize(payload));
};

const ensureIndexHas = async (name: string): Promise<void> => {
  const normalized = normalizeDoctypeName(name);
  if (!normalized) {
    return;
  }
  const index = await loadIndexSet();
  if (index.has(normalized)) {
    return;
  }
  index.add(normalized);
  await persistIndexSet(index);
};

const readStoredDoctype = async (
  name: string
): Promise<StoredDoctype | null> => {
  const normalized = normalizeDoctypeName(name);
  if (!normalized) {
    return null;
  }
  const key = storageKeyFor(normalized);
  const raw = await AsyncStorage.getItem(key);
  const parsed = parseJson<StoredDoctype>(raw);
  return parsed && parsed.payload ? parsed : null;
};

const writeStoredDoctype = async (entry: StoredDoctype): Promise<void> => {
  const normalized = normalizeDoctypeName(entry.name);
  if (!normalized) {
    return;
  }
  const payload: StoredDoctype = {
    ...entry,
    name: normalized,
    dependencies: entry.dependencies.map(dep => ({
      name: normalizeDoctypeName(dep.name),
      via: dep.via,
      fieldname: dep.fieldname,
    })),
    fetchedAt: entry.fetchedAt ?? Date.now(),
  };

  await AsyncStorage.setItem(storageKeyFor(normalized), serialize(payload));
  await ensureIndexHas(normalized);
};

const migrateLegacyStorage = async (): Promise<void> => {
  if (isLegacyMigrated) {
    return;
  }
  isLegacyMigrated = true;

  const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) {
    return;
  }

  const legacy = parseJson<Record<string, DocType>>(legacyRaw);
  if (!legacy) {
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }

  for (const [name, doc] of Object.entries(legacy)) {
    const normalized = normalizeDoctypeName(name);
    if (!normalized || !doc) {
      continue;
    }
    try {
      const dependencies = extractDependencies(doc);
      await writeStoredDoctype({
        name: normalized,
        payload: doc,
        dependencies,
        origin: 'root',
        fetchedAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to migrate legacy doctype:', name, error);
    }
  }

  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
};

export async function getDocTypeFromLocal(
  docTypeName: string
): Promise<DocType | null> {
  await migrateLegacyStorage();
  const stored = await readStoredDoctype(docTypeName);
  return stored ? stored.payload : null;
}

export async function saveDocTypeToLocal(
  docTypeName: string,
  docTypeData: DocType,
  origin: OriginType = 'root'
): Promise<boolean> {
  try {
    await migrateLegacyStorage();
    const normalized = normalizeDoctypeName(docTypeName);
    if (!normalized) {
      return false;
    }
    const dependencies = extractDependencies(docTypeData);
    await writeStoredDoctype({
      name: normalized,
      payload: docTypeData,
      dependencies,
      origin,
      fetchedAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.error(`Error saving local doctype: ${docTypeName}:`, error);
    throw error as Error;
  }
}

export async function getAllDoctypesFromLocal(): Promise<
  Record<string, DocType>
> {
  await migrateLegacyStorage();
  const index = await loadIndexSet();
  if (index.size === 0) {
    return {};
  }

  const keys = Array.from(index.values()).map(storageKeyFor);
  const entries = await AsyncStorage.multiGet(keys);

  const result: Record<string, DocType> = {};
  entries.forEach(([, value]) => {
    if (!value) {
      return;
    }
    const parsed = parseJson<StoredDoctype>(value);
    if (parsed?.payload) {
      result[normalizeDoctypeName(parsed.name)] = parsed.payload;
    }
  });

  return result;
}

export async function getAllDocTypeNames(): Promise<FormItem[]> {
  await migrateLegacyStorage();
  const index = await loadIndexSet();
  return Array.from(index.values()).map(name => ({ name }));
}

export async function getRootDocTypeNames(): Promise<FormItem[]> {
  await migrateLegacyStorage();
  const index = await loadIndexSet();
  if (index.size === 0) {
    return [];
  }

  const keys = Array.from(index.values()).map(storageKeyFor);
  const entries = await AsyncStorage.multiGet(keys);

  const rootDoctypes: FormItem[] = [];
  entries.forEach(([, value]) => {
    if (!value) {
      return;
    }
    const parsed = parseJson<StoredDoctype>(value);
    if (parsed?.payload && parsed.origin === 'root') {
      rootDoctypes.push({ name: parsed.name });
    }
  });

  return rootDoctypes;
}

export async function clearAllDoctypesFromLocal(): Promise<void> {
  await migrateLegacyStorage();
  const index = await loadIndexSet();
  if (index.size > 0) {
    const keys = Array.from(index.values()).map(storageKeyFor);
    await AsyncStorage.multiRemove(keys);
  }
  cachedIndex = new Set();
  await AsyncStorage.removeItem(DOCTYPE_INDEX_KEY);
}

const defaultFetcher = async (name: string): Promise<DocType> => {
  const response = await getDoctypeByName({
    path: { form_name: name },
  });
  const data =
    (response as any)?.data?.data ??
    (response as any)?.data ??
    (response as any);
  if (!data) {
    throw new Error(`Doctype response missing data for ${name}`);
  }
  return data as DocType;
};

export async function ensureDoctypeGraph(
  rootName: string,
  options: EnsureDoctypeOptions = {}
): Promise<EnsureDoctypeResult> {
  await migrateLegacyStorage();

  const { networkAvailable = true, forceRefresh = false } = options;
  const fetcher = options.fetcher ?? defaultFetcher;

  const queue: QueueNode[] = [
    {
      name: normalizeDoctypeName(rootName),
      via: 'root',
      fieldname: null,
    },
  ];
  const visited = new Set<string>();
  const ensured: string[] = [];
  const fetched: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ name: string; error: unknown }> = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const normalized = normalizeDoctypeName(current.name);
    if (!normalized) {
      continue;
    }

    const visitedKey = visitedKeyFor(normalized);
    if (visited.has(visitedKey)) {
      continue;
    }
    visited.add(visitedKey);

    try {
      let stored = await readStoredDoctype(normalized);

      if (!stored || forceRefresh) {
        if (!networkAvailable) {
          // If offline and not in cache, skip it
          if (!stored) {
            skipped.push(normalized);
            continue;
          }
          // If offline but in cache and forceRefresh, use cached version
          // (don't skip, just use what we have)
        } else {
          // Online: fetch from server
          console.log(
            '[ensureDoctypeGraph] fetching doctype from server',
            normalized,
            {
              reason: stored ? 'forceRefresh' : 'not_in_cache',
              parent: current.via,
              fieldname: current.fieldname ?? null,
            }
          );
          const payload = await fetcher(normalized);
          const dependencies = extractDependencies(payload);
          await writeStoredDoctype({
            name: normalized,
            payload,
            dependencies,
            origin: current.via,
            fetchedAt: Date.now(),
          });
          stored = {
            name: normalized,
            payload,
            dependencies,
            origin: current.via,
            fetchedAt: Date.now(),
          };
          fetched.push(normalized);
        }
      } else if (!stored.origin && current.via !== 'root') {
        // back-fill origin for existing cache entries
        console.log(
          '[ensureDoctypeGraph] updating cached origin for',
          normalized,
          'via',
          current.via
        );
        await writeStoredDoctype({
          ...stored,
          origin: current.via,
          fetchedAt: stored.fetchedAt ?? Date.now(),
        });
      }

      if (!stored) {
        continue;
      }

      ensured.push(normalized);

      if (current.via === 'link') {
        continue;
      }

      stored.dependencies.forEach(dep => {
        const depName = normalizeDoctypeName(dep.name);
        console.log('[ensureDoctypeGraph] discovered dependency', {
          parent: normalized,
          child: depName,
          via: dep.via,
          fieldname: dep.fieldname,
        });
        if (!depName) {
          return;
        }
        const depVisitedKey = visitedKeyFor(depName);
        if (visited.has(depVisitedKey)) {
          return;
        }
        queue.push({
          name: depName,
          via: dep.via,
          fieldname: dep.fieldname,
        });
      });
    } catch (error) {
      console.error('Failed ensuring doctype:', normalized, error);
      errors.push({ name: normalized, error });
    }
  }

  // After ensuring all doctypes, fetch and cache link options for linked doctypes
  if (networkAvailable) {
    const linkedDoctypes = new Set<string>();
    for (const ensuredName of ensured) {
      const stored = await readStoredDoctype(ensuredName);
      if (stored) {
        stored.dependencies.forEach(dep => {
          if (dep.via === 'link') {
            linkedDoctypes.add(normalizeDoctypeName(dep.name));
          }
        });
      }
    }

    // Fetch and cache link options for all linked doctypes
    for (const linkedDoctype of linkedDoctypes) {
      if (!linkedDoctype) {
        continue;
      }
      try {
        // Check if already cached
        const cached = await getLinkOptionsFromLocal(linkedDoctype);
        if (cached && cached.length > 0) {
          continue; // Already cached
        }

        // Fetch from API
        const response = await getLinkOptions({
          path: { linked_doctype: linkedDoctype },
        });
        const raw = (response as any)?.data ?? (response as any);
        let list: unknown[] = [];
        if (Array.isArray(raw)) {
          list = raw as unknown[];
        } else if (raw && Array.isArray(raw.data)) {
          list = raw.data as unknown[];
        }
        const normalizedOptions: string[] = list
          .map(item => {
            if (typeof item === 'string') {
              return item;
            }
            if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              const labelCandidate =
                obj.label ??
                obj.value ??
                obj.name ??
                obj.title ??
                obj.id ??
                obj.key;
              if (typeof labelCandidate === 'string') {
                return labelCandidate;
              }
            }
            return undefined;
          })
          .filter(
            (opt): opt is string =>
              typeof opt === 'string' && opt.trim().length > 0
          )
          .map(opt => opt.trim());

        if (normalizedOptions.length > 0) {
          await saveLinkOptionsToLocal(linkedDoctype, normalizedOptions);
          console.log(
            '[ensureDoctypeGraph] cached link options for',
            linkedDoctype,
            'count:',
            normalizedOptions.length
          );
        }
      } catch (error) {
        console.warn(
          '[ensureDoctypeGraph] failed to cache link options for',
          linkedDoctype,
          error
        );
        // Don't fail the whole operation if link options can't be fetched
      }
    }
  }

  return {
    ensured,
    fetched,
    skipped,
    errors,
  };
}

export function extractFields(docType: DocType): RawField[] {
  return docType.fields.map((field: Field) => ({
    fieldname: field.fieldname,
    fieldtype: field.fieldtype,
    label: field.label,
    options: field.options,
    hidden: field.hidden,
    print_hide: field.print_hide,
    report_hide: field.report_hide,
  }));
}

const linkOptionsStorageKey = (doctype: string): string => {
  const normalized = normalizeDoctypeName(doctype);
  return `${LINK_OPTIONS_PREFIX}${normalized}`;
};

export async function getLinkOptionsFromLocal(
  doctype: string
): Promise<string[] | null> {
  const normalized = normalizeDoctypeName(doctype);
  if (!normalized) {
    return null;
  }
  const key = linkOptionsStorageKey(normalized);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }
  const parsed = parseJson<string[]>(raw);
  return parsed;
}

export async function saveLinkOptionsToLocal(
  doctype: string,
  options: string[]
): Promise<void> {
  const normalized = normalizeDoctypeName(doctype);
  if (!normalized) {
    return;
  }
  const key = linkOptionsStorageKey(normalized);
  await AsyncStorage.setItem(key, serialize(options));
}
