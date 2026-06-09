import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ReviewFolderRow, ReviewItemRow } from "@/lib/types";

const LOCAL_KEY = "workspace-review:v1";

type LocalStore = {
  folders: ReviewFolderRow[];
  items: ReviewItemRow[];
};

function emptyStore(): LocalStore {
  return { folders: [], items: [] };
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyStore();
    const data = JSON.parse(raw) as LocalStore;
    if (!data.folders || !data.items) return emptyStore();
    return data;
  } catch {
    return emptyStore();
  }
}

function writeLocal(store: LocalStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function sortFoldersByName(folders: ReviewFolderRow[]): ReviewFolderRow[] {
  return [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

export function usingLocalStorage(): boolean {
  return getSupabaseBrowserClient() === null;
}

export async function listReviewFolders(): Promise<ReviewFolderRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data: folders, error } = await supabase
      .from("review_folders")
      .select("id, name, created_at");
    if (error) {
      console.error(error);
      const store = readLocal();
      return sortFoldersByName(
        store.folders.map((f) => ({
          ...f,
          item_count: store.items.filter((i) => i.folder_id === f.id).length,
        }))
      );
    }
    const { data: items } = await supabase.from("review_items").select("folder_id");
    const countMap: Record<string, number> = {};
    for (const r of items ?? []) {
      const fid = r.folder_id as string;
      countMap[fid] = (countMap[fid] ?? 0) + 1;
    }
    return sortFoldersByName(
      (folders ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        created_at: f.created_at,
        item_count: countMap[f.id] ?? 0,
      }))
    );
  }
  const store = readLocal();
  return sortFoldersByName(
    store.folders.map((f) => ({
      ...f,
      item_count: store.items.filter((i) => i.folder_id === f.id).length,
    }))
  );
}

export async function createReviewFolder(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("review_folders")
      .insert({ name: trimmed })
      .select("id")
      .single();
    if (error) {
      console.error(error);
      const id = crypto.randomUUID();
      const store = readLocal();
      store.folders.unshift({
        id,
        name: trimmed,
        created_at: new Date().toISOString(),
      });
      writeLocal(store);
      return id;
    }
    return data!.id as string;
  }
  const id = crypto.randomUUID();
  const store = readLocal();
  store.folders.unshift({
    id,
    name: trimmed,
    created_at: new Date().toISOString(),
  });
  writeLocal(store);
  return id;
}

export async function updateReviewFolderName(folderId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("review_folders").update({ name: trimmed }).eq("id", folderId);
    if (error) {
      console.error(error);
      const store = readLocal();
      const idx = store.folders.findIndex((f) => f.id === folderId);
      if (idx >= 0) {
        store.folders[idx] = { ...store.folders[idx], name: trimmed };
        writeLocal(store);
      }
      throw error;
    }
    return;
  }
  const store = readLocal();
  const idx = store.folders.findIndex((f) => f.id === folderId);
  if (idx >= 0) {
    store.folders[idx] = { ...store.folders[idx], name: trimmed };
    writeLocal(store);
  }
}

export async function deleteReviewFolder(folderId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("review_folders").delete().eq("id", folderId);
    if (error) {
      console.error(error);
      const store = readLocal();
      store.folders = store.folders.filter((f) => f.id !== folderId);
      store.items = store.items.filter((i) => i.folder_id !== folderId);
      writeLocal(store);
      throw error;
    }
    return;
  }
  const store = readLocal();
  store.folders = store.folders.filter((f) => f.id !== folderId);
  store.items = store.items.filter((i) => i.folder_id !== folderId);
  writeLocal(store);
}

export async function listReviewItemsInFolder(folderId: string): Promise<ReviewItemRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("review_items")
      .select("*")
      .eq("folder_id", folderId)
      .order("position", { ascending: true });
    if (error) {
      console.error(error);
      return readLocal()
        .items.filter((i) => i.folder_id === folderId)
        .sort((a, b) => a.position - b.position);
    }
    return (data ?? []) as ReviewItemRow[];
  }
  return readLocal()
    .items.filter((i) => i.folder_id === folderId)
    .sort((a, b) => a.position - b.position);
}

export async function appendReviewItems(
  folderId: string,
  items: { kana: string; definition: string; kanji: string }[]
): Promise<number> {
  const rows = items
    .map((fields) => ({
      kana: fields.kana.trim(),
      definition: fields.definition.trim(),
      kanji: fields.kanji.trim(),
    }))
    .filter((f) => f.kana && f.definition && f.kanji);

  if (rows.length === 0) return 0;

  const existing = await listReviewItemsInFolder(folderId);
  const base =
    existing.length === 0 ? 0 : Math.max(...existing.map((i) => i.position), -1) + 1;

  const reviewRows: ReviewItemRow[] = rows.map((f, i) => ({
    id: crypto.randomUUID(),
    folder_id: folderId,
    kana: f.kana,
    definition: f.definition,
    kanji: f.kanji,
    position: base + i,
    starred: false,
    created_at: new Date().toISOString(),
  }));

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("review_items").insert(
      reviewRows.map((row) => {
        const { created_at, ...rest } = row;
        void created_at;
        return rest;
      })
    );
    if (error) {
      console.error(error);
      const store = readLocal();
      store.items.push(...reviewRows);
      writeLocal(store);
      throw error;
    }
    return reviewRows.length;
  }

  const store = readLocal();
  store.items.push(...reviewRows);
  writeLocal(store);
  return reviewRows.length;
}

export async function createReviewItem(
  folderId: string,
  fields: { kana: string; definition: string; kanji: string }
): Promise<string> {
  const kana = fields.kana.trim();
  const definition = fields.definition.trim();
  const kanji = fields.kanji.trim();
  if (!kana || !definition || !kanji) {
    throw new Error("Hiragana, English meaning, and kanji are required.");
  }

  const existing = await listReviewItemsInFolder(folderId);
  const position =
    existing.length === 0 ? 0 : Math.max(...existing.map((i) => i.position), -1) + 1;

  const row: ReviewItemRow = {
    id: crypto.randomUUID(),
    folder_id: folderId,
    kana,
    definition,
    kanji,
    position,
    starred: false,
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { created_at, ...rest } = row;
    void created_at;
    const { error } = await supabase.from("review_items").insert(rest);
    if (error) {
      console.error(error);
      const store = readLocal();
      store.items.push(row);
      writeLocal(store);
      throw error;
    }
    return row.id;
  }
  const store = readLocal();
  store.items.push(row);
  writeLocal(store);
  return row.id;
}

export async function updateReviewItem(
  id: string,
  patch: Partial<Omit<ReviewItemRow, "id" | "created_at" | "folder_id">>
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("review_items").update(patch).eq("id", id);
    if (error) {
      console.error(error);
      const store = readLocal();
      const idx = store.items.findIndex((i) => i.id === id);
      if (idx >= 0) {
        store.items[idx] = { ...store.items[idx], ...patch };
        writeLocal(store);
      }
      throw error;
    }
    return;
  }
  const store = readLocal();
  const idx = store.items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    store.items[idx] = { ...store.items[idx], ...patch };
    writeLocal(store);
  }
}

export async function deleteReviewItems(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("review_items").delete().in("id", unique);
    if (error) {
      console.error(error);
      const store = readLocal();
      const drop = new Set(unique);
      store.items = store.items.filter((i) => !drop.has(i.id));
      writeLocal(store);
      throw error;
    }
    return;
  }
  const store = readLocal();
  const drop = new Set(unique);
  store.items = store.items.filter((i) => !drop.has(i.id));
  writeLocal(store);
}

export async function reorderReviewItems(folderId: string, orderedIds: string[]): Promise<void> {
  const current = await listReviewItemsInFolder(folderId);
  if (current.length !== orderedIds.length) {
    throw new Error("Cannot reorder: item list no longer matches.");
  }
  const cur = new Set(current.map((i) => i.id));
  for (const id of orderedIds) {
    if (!cur.has(id)) throw new Error("Cannot reorder: invalid item.");
  }
  await Promise.all(orderedIds.map((id, position) => updateReviewItem(id, { position })));
}
