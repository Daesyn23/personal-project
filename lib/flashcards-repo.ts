import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CardSetRow, FlashcardDraft, FlashcardRow } from "@/lib/types";

const LOCAL_KEY = "flashcard-presentation:v2";

type LocalStore = {
  sets: CardSetRow[];
  cards: FlashcardRow[];
};

function emptyStore(): LocalStore {
  return { sets: [], cards: [] };
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("flashcard-presentation:v1");
      if (legacy) {
        const parsed = JSON.parse(legacy) as FlashcardRow[];
        if (Array.isArray(parsed) && parsed.length) {
          const sid = crypto.randomUUID();
          const name = "Imported cards";
          const migrated: FlashcardRow[] = parsed.map((c, i) => ({
            ...c,
            set_id: sid,
            position: i,
          }));
          const store: LocalStore = {
            sets: [{ id: sid, name, created_at: new Date().toISOString() }],
            cards: migrated,
          };
          localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
          localStorage.removeItem("flashcard-presentation:v1");
          return store;
        }
      }
      return emptyStore();
    }
    const data = JSON.parse(raw) as LocalStore;
    if (!data.sets || !data.cards) return emptyStore();
    return data;
  } catch {
    return emptyStore();
  }
}

function writeLocal(store: LocalStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function sortCardSetsByName(sets: CardSetRow[]): CardSetRow[] {
  return [...sets].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

export async function listCardSets(): Promise<CardSetRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data: sets, error } = await supabase.from("card_sets").select("id, name, created_at");
    if (error) {
      console.error(error);
      const store = readLocal();
      return sortCardSetsByName(
        store.sets.map((x) => ({
          ...x,
          card_count: store.cards.filter((c) => c.set_id === x.id).length,
        }))
      );
    }
    const { data: fc } = await supabase.from("flashcards").select("set_id");
    const countMap: Record<string, number> = {};
    for (const r of fc ?? []) {
      const sid = r.set_id as string | null;
      if (!sid) continue;
      countMap[sid] = (countMap[sid] ?? 0) + 1;
    }
    return sortCardSetsByName(
      (sets ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        created_at: s.created_at,
        card_count: countMap[s.id] ?? 0,
      }))
    );
  }
  const store = readLocal();
  return sortCardSetsByName(
    store.sets.map((s) => ({
      ...s,
      card_count: store.cards.filter((c) => c.set_id === s.id).length,
    }))
  );
}

export async function createCardSet(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Set name is required");

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("card_sets")
      .insert({ name: trimmed })
      .select("id")
      .single();
    if (error) {
      console.error(error);
      const id = crypto.randomUUID();
      const store = readLocal();
      store.sets.unshift({
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
  store.sets.unshift({
    id,
    name: trimmed,
    created_at: new Date().toISOString(),
  });
  writeLocal(store);
  return id;
}

export async function updateCardSetName(setId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("card_sets").update({ name: trimmed }).eq("id", setId);
    if (error) {
      console.error(error);
      const store = readLocal();
      const idx = store.sets.findIndex((s) => s.id === setId);
      if (idx >= 0) {
        store.sets[idx] = { ...store.sets[idx], name: trimmed };
        writeLocal(store);
      }
      throw error;
    }
    return;
  }
  const store = readLocal();
  const idx = store.sets.findIndex((s) => s.id === setId);
  if (idx >= 0) {
    store.sets[idx] = { ...store.sets[idx], name: trimmed };
    writeLocal(store);
  }
}

export async function listFlashcardsInSet(setId: string): Promise<FlashcardRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("set_id", setId)
      .order("position", { ascending: true });
    if (error) {
      console.error(error);
      return readLocal().cards.filter((c) => c.set_id === setId).sort((a, b) => a.position - b.position);
    }
    return (data ?? []) as FlashcardRow[];
  }
  return readLocal()
    .cards.filter((c) => c.set_id === setId)
    .sort((a, b) => a.position - b.position);
}

/** Insert new cards into a set (positions 0..n-1 within the set). */
export async function addCardsToSet(setId: string, cards: FlashcardDraft[]): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const rows: FlashcardRow[] = cards.map((c, i) => ({
    id: c.id ?? crypto.randomUUID(),
    set_id: setId,
    phonetic_reading: c.phonetic_reading,
    native_script: c.native_script,
    kana: c.kana ?? null,
    kanji: c.kanji ?? null,
    category_label: c.category_label,
    definition: c.definition,
    context_note: c.context_note,
    example_sentence: c.example_sentence,
    example_translation: c.example_translation,
    position: i,
    created_at: new Date().toISOString(),
  }));

  if (supabase) {
    const { error } = await supabase.from("flashcards").insert(
      rows.map((row) => {
        const { created_at, ...rest } = row;
        void created_at;
        return rest;
      })
    );
    if (error) {
      console.error(error);
      const store = readLocal();
      store.cards.push(...rows);
      writeLocal(store);
      throw error;
    }
    return;
  }

  const store = readLocal();
  store.cards.push(...rows);
  writeLocal(store);
}

/** Append cards to an existing set (positions continue after the current max). */
export async function appendCardsToSet(setId: string, cards: FlashcardDraft[]): Promise<void> {
  if (cards.length === 0) return;

  const existing = await listFlashcardsInSet(setId);
  const base =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((c) => c.position), -1) + 1;

  const supabase = getSupabaseBrowserClient();
  const rows: FlashcardRow[] = cards.map((c, i) => ({
    id: c.id ?? crypto.randomUUID(),
    set_id: setId,
    phonetic_reading: c.phonetic_reading,
    native_script: c.native_script,
    kana: c.kana ?? null,
    kanji: c.kanji ?? null,
    category_label: c.category_label,
    definition: c.definition,
    context_note: c.context_note,
    example_sentence: c.example_sentence,
    example_translation: c.example_translation,
    position: base + i,
    created_at: new Date().toISOString(),
  }));

  if (supabase) {
    const { error } = await supabase.from("flashcards").insert(
      rows.map((row) => {
        const { created_at, ...rest } = row;
        void created_at;
        return rest;
      })
    );
    if (error) {
      console.error(error);
      const store = readLocal();
      store.cards.push(...rows);
      writeLocal(store);
      throw error;
    }
    return;
  }

  const store = readLocal();
  store.cards.push(...rows);
  writeLocal(store);
}

export async function deleteFlashcard(id: string): Promise<void> {
  await deleteFlashcards([id]);
}

/** Delete many cards (single round-trip on Supabase). */
export async function deleteFlashcards(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("flashcards").delete().in("id", unique);
    if (error) {
      console.error(error);
      const store = readLocal();
      const drop = new Set(unique);
      store.cards = store.cards.filter((c) => !drop.has(c.id));
      writeLocal(store);
      throw error;
    }
    return;
  }
  const store = readLocal();
  const drop = new Set(unique);
  store.cards = store.cards.filter((c) => !drop.has(c.id));
  writeLocal(store);
}

/** Set presentation order for all cards in a set. `orderedIds` must list each card in the set exactly once. */
export async function reorderFlashcardsInSet(setId: string, orderedIds: string[]): Promise<void> {
  const current = await listFlashcardsInSet(setId);
  if (current.length !== orderedIds.length) {
    throw new Error("Cannot reorder: card list no longer matches.");
  }
  const cur = new Set(current.map((c) => c.id));
  for (const id of orderedIds) {
    if (!cur.has(id)) throw new Error("Cannot reorder: invalid card.");
  }

  await Promise.all(orderedIds.map((id, position) => updateFlashcard(id, { position })));
}

export async function updateFlashcard(
  id: string,
  patch: Partial<Omit<FlashcardRow, "id" | "created_at">>
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from("flashcards").update(patch).eq("id", id);
    if (error) {
      console.error(error);
      const store = readLocal();
      const idx = store.cards.findIndex((c) => c.id === id);
      if (idx >= 0) {
        store.cards[idx] = { ...store.cards[idx], ...patch };
        writeLocal(store);
      }
      throw error;
    }
    return;
  }
  const store = readLocal();
  const idx = store.cards.findIndex((c) => c.id === id);
  if (idx >= 0) {
    store.cards[idx] = { ...store.cards[idx], ...patch };
    writeLocal(store);
  }
}

export function usingLocalStorage(): boolean {
  return getSupabaseBrowserClient() === null;
}
