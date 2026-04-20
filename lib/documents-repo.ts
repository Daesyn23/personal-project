import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceFileRow, WorkspaceFolderRow } from "@/lib/types";
import { idbDeleteBlob, idbGetBlob, idbPutBlob } from "@/lib/workspace-idb";

const LOCAL_KEY = "workspace-documents:v1";
const BUCKET = "workspace-files";

type LocalDocStore = {
  folders: WorkspaceFolderRow[];
  files: WorkspaceFileRow[];
};

function emptyLocal(): LocalDocStore {
  return { folders: [], files: [] };
}

function readLocal(): LocalDocStore {
  if (typeof window === "undefined") return emptyLocal();
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyLocal();
    const data = JSON.parse(raw) as LocalDocStore;
    if (!data.folders || !data.files) return emptyLocal();
    return data;
  } catch {
    return emptyLocal();
  }
}

function writeLocal(store: LocalDocStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function sortFolders(a: WorkspaceFolderRow, b: WorkspaceFolderRow) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/** Root “Collections” list: reverse name order (e.g. N5 above N4). Nested folders stay A→Z. */
function sortFoldersMainCollection(a: WorkspaceFolderRow, b: WorkspaceFolderRow) {
  return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" });
}

function sortFiles(a: WorkspaceFileRow, b: WorkspaceFileRow) {
  return a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ()[\]]+/gu, "_").slice(0, 200) || "file";
}

function collectSubtreeFolderIds(all: WorkspaceFolderRow[], rootId: string): Set<string> {
  const byParent = new Map<string | null, WorkspaceFolderRow[]>();
  for (const f of all) {
    const k = f.parent_id ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(f);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    for (const c of byParent.get(id) ?? []) walk(c.id);
  };
  walk(rootId);
  return out;
}

export async function listWorkspaceFolders(parentId: string | null): Promise<WorkspaceFolderRow[]> {
  const sortFn = parentId === null ? sortFoldersMainCollection : sortFolders;
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    let q = supabase.from("workspace_folders").select("id, name, parent_id, created_at");
    q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      const store = readLocal();
      return store.folders.filter((f) => (f.parent_id ?? null) === parentId).sort(sortFn);
    }
    return (data ?? []).sort(sortFn) as WorkspaceFolderRow[];
  }
  const store = readLocal();
  return store.folders.filter((f) => (f.parent_id ?? null) === parentId).sort(sortFn);
}

/** Subfolders + files directly inside each folder (for collection-style badges). */
export async function addImmediateChildCounts(folders: WorkspaceFolderRow[]): Promise<WorkspaceFolderRow[]> {
  if (folders.length === 0) return [];
  const ids = folders.map((f) => f.id);
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const [subRes, fileRes] = await Promise.all([
      supabase.from("workspace_folders").select("parent_id").in("parent_id", ids),
      supabase.from("workspace_files").select("folder_id").in("folder_id", ids),
    ]);
    if (subRes.error) console.error(subRes.error);
    if (fileRes.error) console.error(fileRes.error);

    const subByParent = new Map<string, number>();
    for (const r of subRes.data ?? []) {
      const p = r.parent_id as string;
      subByParent.set(p, (subByParent.get(p) ?? 0) + 1);
    }
    const fileByFolder = new Map<string, number>();
    for (const r of fileRes.data ?? []) {
      const fid = r.folder_id as string | null;
      if (!fid) continue;
      fileByFolder.set(fid, (fileByFolder.get(fid) ?? 0) + 1);
    }
    return folders.map((f) => ({
      ...f,
      item_count: (subByParent.get(f.id) ?? 0) + (fileByFolder.get(f.id) ?? 0),
    }));
  }

  const store = readLocal();
  return folders.map((f) => {
    const subs = store.folders.filter((x) => x.parent_id === f.id).length;
    const fc = store.files.filter((x) => x.folder_id === f.id).length;
    return { ...f, item_count: subs + fc };
  });
}

export async function listWorkspaceFiles(folderId: string | null): Promise<WorkspaceFileRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    let q = supabase.from("workspace_files").select("id, folder_id, filename, storage_path, mime_type, byte_size, created_at");
    q = folderId === null ? q.is("folder_id", null) : q.eq("folder_id", folderId);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      const store = readLocal();
      return store.files.filter((f) => (f.folder_id ?? null) === folderId).sort(sortFiles);
    }
    return (data ?? []).sort(sortFiles) as WorkspaceFileRow[];
  }
  const store = readLocal();
  return store.files.filter((f) => (f.folder_id ?? null) === folderId).sort(sortFiles);
}

export async function createWorkspaceFolder(name: string, parentId: string | null): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");

  const supabase = getSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  if (supabase) {
    const { data, error } = await supabase
      .from("workspace_folders")
      .insert({ id, name: trimmed, parent_id: parentId })
      .select("id")
      .single();
    if (error) {
      console.error(error);
      const store = readLocal();
      store.folders.push({ id, name: trimmed, parent_id: parentId, created_at });
      writeLocal(store);
      throw error;
    }
    return (data?.id as string) ?? id;
  }

  const store = readLocal();
  store.folders.push({ id, name: trimmed, parent_id: parentId, created_at });
  writeLocal(store);
  return id;
}

export async function updateWorkspaceFolderName(folderId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("workspace_folders").update({ name: trimmed }).eq("id", folderId);
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

export async function deleteWorkspaceFolder(folderId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { data: allFolders, error: e1 } = await supabase.from("workspace_folders").select("id, parent_id");
    if (e1) {
      console.error(e1);
      return deleteWorkspaceFolderLocal(folderId);
    }
    const folderRows = (allFolders ?? []) as Pick<WorkspaceFolderRow, "id" | "parent_id">[];
    const full = folderRows.map((r) => ({
      id: r.id,
      name: "",
      parent_id: r.parent_id ?? null,
    }));
    const subtree = collectSubtreeFolderIds(full, folderId);
    const { data: files, error: e2 } = await supabase
      .from("workspace_files")
      .select("storage_path")
      .in("folder_id", [...subtree]);
    if (e2) console.error(e2);
    const paths = (files ?? []).map((r) => r.storage_path as string).filter(Boolean);
    if (paths.length) {
      const { error: e3 } = await supabase.storage.from(BUCKET).remove(paths);
      if (e3) console.error(e3);
    }
    const { error: e4 } = await supabase.from("workspace_folders").delete().eq("id", folderId);
    if (e4) {
      console.error(e4);
      deleteWorkspaceFolderLocal(folderId);
      throw e4;
    }
    return;
  }

  deleteWorkspaceFolderLocal(folderId);
}

function deleteWorkspaceFolderLocal(folderId: string) {
  const store = readLocal();
  const subtree = collectSubtreeFolderIds(store.folders, folderId);
  const dropFolders = subtree;
  const dropFiles = store.files.filter((f) => f.folder_id && dropFolders.has(f.folder_id));
  for (const f of dropFiles) {
    if (f.storage_path.startsWith("local:")) void idbDeleteBlob(f.id);
  }
  store.files = store.files.filter((f) => !f.folder_id || !dropFolders.has(f.folder_id));
  store.folders = store.folders.filter((f) => !dropFolders.has(f.id));
  writeLocal(store);
}

export async function uploadWorkspaceFile(folderId: string | null, file: File): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const safe = sanitizeFilename(file.name);
  const created_at = new Date().toISOString();

  if (supabase) {
    const path = `${folderId ?? "root"}/${id}/${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (upErr) {
      console.error(upErr);
      throw upErr;
    }
    const { error: insErr } = await supabase.from("workspace_files").insert({
      id,
      folder_id: folderId,
      filename: file.name,
      storage_path: path,
      mime_type: file.type || null,
      byte_size: file.size,
      created_at,
    });
    if (insErr) {
      console.error(insErr);
      await supabase.storage.from(BUCKET).remove([path]);
      throw insErr;
    }
    return;
  }

  await idbPutBlob(id, file);
  const store = readLocal();
  store.files.push({
    id,
    folder_id: folderId,
    filename: file.name,
    storage_path: `local:${id}`,
    mime_type: file.type || null,
    byte_size: file.size,
    created_at,
  });
  writeLocal(store);
}

export async function deleteWorkspaceFile(row: WorkspaceFileRow): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { error: r1 } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (r1) console.error(r1);
    const { error: r2 } = await supabase.from("workspace_files").delete().eq("id", row.id);
    if (r2) {
      console.error(r2);
      const store = readLocal();
      store.files = store.files.filter((f) => f.id !== row.id);
      writeLocal(store);
      throw r2;
    }
    return;
  }

  await idbDeleteBlob(row.id);
  const store = readLocal();
  store.files = store.files.filter((f) => f.id !== row.id);
  writeLocal(store);
}

/** Signed URL (Supabase) or object URL from IndexedDB blob (local). Caller should revoke object URLs when done. */
export async function getWorkspaceFileViewUrl(row: WorkspaceFileRow): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (supabase && !row.storage_path.startsWith("local:")) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
    if (error || !data?.signedUrl) {
      console.error(error);
      throw new Error("Could not create download link.");
    }
    return data.signedUrl;
  }
  const blob = await idbGetBlob(row.id);
  if (!blob) throw new Error("File not found in browser storage.");
  return URL.createObjectURL(blob);
}
