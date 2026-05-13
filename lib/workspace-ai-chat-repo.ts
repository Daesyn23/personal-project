import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AiConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sort_order: number;
  created_at: string;
};

const NEW_CHAT_TITLE = "New chat";

export function isWorkspaceAiChatSynced(): boolean {
  return getSupabaseBrowserClient() !== null;
}

export async function listAiConversations(limit = 80): Promise<AiConversationRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("workspace_ai_conversations")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[workspace-ai-chat] list conversations", error);
    return [];
  }
  return (data ?? []) as AiConversationRow[];
}

export async function createAiConversation(title = NEW_CHAT_TITLE): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("workspace_ai_conversations")
    .insert({ title: title.slice(0, 120) })
    .select("id")
    .single();
  if (error || !data?.id) {
    console.error("[workspace-ai-chat] create conversation", error);
    return null;
  }
  return data.id as string;
}

export async function deleteAiConversation(conversationId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await supabase.from("workspace_ai_conversations").delete().eq("id", conversationId);
  if (error) {
    console.error("[workspace-ai-chat] delete conversation", error);
    return false;
  }
  return true;
}

export async function listAiMessages(conversationId: string): Promise<AiMessageRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("workspace_ai_messages")
    .select("id, conversation_id, role, content, sort_order, created_at")
    .eq("conversation_id", conversationId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[workspace-ai-chat] list messages", error);
    return [];
  }
  return (data ?? []) as AiMessageRow[];
}

async function nextSortOrder(conversationId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return 0;
  const { data } = await supabase
    .from("workspace_ai_messages")
    .select("sort_order")
    .eq("conversation_id", conversationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const n = typeof data?.sort_order === "number" ? data.sort_order : -1;
  return n + 1;
}

async function touchConversation(conversationId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const iso = new Date().toISOString();
  await supabase.from("workspace_ai_conversations").update({ updated_at: iso }).eq("id", conversationId);
}

export async function appendAiMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const sort_order = await nextSortOrder(conversationId);
  const { error } = await supabase.from("workspace_ai_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    sort_order,
  });
  if (error) {
    console.error("[workspace-ai-chat] append message", error);
    return false;
  }
  await touchConversation(conversationId);
  return true;
}

export async function maybeRenameConversationFromFirstMessage(
  conversationId: string,
  firstUserText: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { data: conv, error: selErr } = await supabase
    .from("workspace_ai_conversations")
    .select("title")
    .eq("id", conversationId)
    .maybeSingle();
  if (selErr || !conv || (conv as { title?: string }).title !== NEW_CHAT_TITLE) return;
  const raw = firstUserText.trim().replace(/\s+/g, " ");
  const title = (raw.length > 56 ? `${raw.slice(0, 56)}…` : raw) || NEW_CHAT_TITLE;
  await supabase
    .from("workspace_ai_conversations")
    .update({ title: title.slice(0, 120), updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
