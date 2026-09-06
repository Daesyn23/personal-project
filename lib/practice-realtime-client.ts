import type { JlptPracticeLevel, PracticeSpeechRegister } from "@/lib/japanese-practice-prompt";

export type JapaneseSpeechFeedback = {
  status: "correct" | "almost" | "needs_practice" | "not_japanese";
  heard: string;
  naturalJapanese: string;
  feedback: string;
  pronunciationFocus: string;
};

export type RealtimeVoicePhase = "listening" | "thinking" | "speaking";

export type PracticeRealtimeCallbacks = {
  onReady?: () => void;
  onPhase?: (phase: RealtimeVoicePhase) => void;
  onSpeechStarted?: () => void;
  onInputDelta?: (text: string) => void;
  onUserTranscript?: (itemId: string, text: string) => void;
  onAssistantTranscript?: (itemId: string, text: string) => void;
  onFeedback?: (feedback: JapaneseSpeechFeedback) => void;
  onError?: (message: string) => void;
  onClosed?: () => void;
};

export type PracticeRealtimeSession = {
  close: () => void;
  setMuted: (muted: boolean) => void;
  interrupt: () => void;
  sendText: (text: string) => void;
  updateEagerness: (eagerness: "low" | "medium" | "high") => void;
};

type RealtimeEvent = {
  type?: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string };
  response?: {
    status?: string;
    status_details?: { error?: { message?: string } };
    output?: Array<{
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
  };
};

function browserSupportsRealtimeVoice(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function isPracticeRealtimeSupported(): boolean {
  return browserSupportsRealtimeVoice();
}

export function practiceVadEagerness(silenceMsIncomplete: number): "low" | "medium" | "high" {
  // Existing balanced settings should feel conversational in Realtime. Semantic
  // VAD high ends a confident utterance quickly while still understanding pauses.
  if (silenceMsIncomplete >= 3600) return "low";
  if (silenceMsIncomplete >= 2800) return "medium";
  return "high";
}

function parseFeedback(raw: string): JapaneseSpeechFeedback | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const status = value.status;
    if (
      status !== "correct" &&
      status !== "almost" &&
      status !== "needs_practice" &&
      status !== "not_japanese"
    ) {
      return null;
    }
    const text = (key: string) => (typeof value[key] === "string" ? value[key].trim() : "");
    return {
      status,
      heard: text("heard"),
      naturalJapanese: text("natural_japanese"),
      feedback: text("feedback"),
      pronunciationFocus: text("pronunciation_focus"),
    };
  } catch {
    return null;
  }
}

async function errorFromResponse(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const data = JSON.parse(raw) as { error?: string };
    return data.error || `Could not start voice (${response.status}).`;
  } catch {
    return raw || `Could not start voice (${response.status}).`;
  }
}

export async function connectPracticeRealtime(options: {
  stream: MediaStream;
  level: JlptPracticeLevel;
  register: PracticeSpeechRegister;
  eagerness: "low" | "medium" | "high";
  callbacks: PracticeRealtimeCallbacks;
}): Promise<PracticeRealtimeSession> {
  if (!browserSupportsRealtimeVoice()) {
    throw new Error("Realtime voice is not supported in this browser.");
  }

  const { callbacks } = options;
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel("oai-events");
  const remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.setAttribute("playsinline", "true");
  let closed = false;
  const inputDeltas = new Map<string, string>();
  const assistantDeltas = new Map<string, string>();

  const send = (event: Record<string, unknown>) => {
    if (channel.readyState === "open") channel.send(JSON.stringify(event));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    try {
      channel.close();
    } catch {
      // Already closed.
    }
    pc.close();
    callbacks.onClosed?.();
  };

  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0] || new MediaStream([event.track]);
    void remoteAudio.play().catch(() => {
      callbacks.onError?.("Berry's audio was blocked. Allow sound for this site and try again.");
    });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      callbacks.onError?.("Berry's live voice connection was interrupted.");
      close();
    }
  };

  const handleFunctionCalls = (event: RealtimeEvent) => {
    const calls = event.response?.output?.filter(
      (item) => item.type === "function_call" && item.name === "report_japanese_feedback"
    );
    if (!calls?.length) return false;

    for (const call of calls) {
      const feedback = parseFeedback(call.arguments || "");
      if (feedback) callbacks.onFeedback?.(feedback);
      if (call.call_id) {
        send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ saved: true }),
          },
        });
      }
    }

    return true;
  };

  const requestBackgroundFeedback = () => {
    send({
      type: "response.create",
      response: {
        output_modalities: ["text"],
        tool_choice: "required",
        max_output_tokens: 140,
        reasoning: { effort: "low" },
        instructions:
          "Silently assess the learner's most recent spoken turn by calling report_japanese_feedback exactly once. Judge their original audio, including pronunciation. Do not produce a message or another spoken reply.",
      },
    });
  };

  channel.addEventListener("open", () => callbacks.onReady?.());
  channel.addEventListener("message", (message) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(String(message.data)) as RealtimeEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        callbacks.onSpeechStarted?.();
        callbacks.onPhase?.("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        callbacks.onPhase?.("thinking");
        break;
      case "conversation.item.input_audio_transcription.delta": {
        const itemId = event.item_id || "current";
        const text = `${inputDeltas.get(itemId) || ""}${event.delta || ""}`;
        inputDeltas.set(itemId, text);
        callbacks.onInputDelta?.(text.trim());
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const itemId = event.item_id || crypto.randomUUID();
        const text = (event.transcript || inputDeltas.get(itemId) || "").trim();
        inputDeltas.delete(itemId);
        callbacks.onInputDelta?.("");
        if (text) callbacks.onUserTranscript?.(itemId, text);
        break;
      }
      case "response.output_audio_transcript.delta": {
        const itemId = event.item_id || "berry-current";
        const text = `${assistantDeltas.get(itemId) || ""}${event.delta || ""}`;
        assistantDeltas.set(itemId, text);
        callbacks.onPhase?.("speaking");
        callbacks.onAssistantTranscript?.(itemId, text.trim());
        break;
      }
      case "response.output_audio_transcript.done": {
        const itemId = event.item_id || "berry-current";
        const text = (event.transcript || assistantDeltas.get(itemId) || "").trim();
        if (text) callbacks.onAssistantTranscript?.(itemId, text);
        break;
      }
      case "response.done":
        if (handleFunctionCalls(event)) {
          break;
        }
        if (event.response?.status === "completed") {
          const generatedSpokenReply = event.response.output?.some((item) => item.type === "message");
          if (generatedSpokenReply) requestBackgroundFeedback();
          // WebRTC may still have a small amount of buffered audio to play.
          window.setTimeout(() => callbacks.onPhase?.("listening"), 180);
        } else if (event.response?.status === "failed") {
          callbacks.onError?.(
            event.response.status_details?.error?.message || "Berry could not finish that reply."
          );
          callbacks.onPhase?.("listening");
        }
        break;
      case "output_audio_buffer.stopped":
        callbacks.onPhase?.("listening");
        break;
      case "error":
        callbacks.onError?.(event.error?.message || "Berry's live voice had a problem.");
        break;
    }
  });

  const track = options.stream.getAudioTracks()[0];
  if (!track) {
    close();
    throw new Error("No microphone track was available.");
  }
  pc.addTrack(track, options.stream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  if (!offer.sdp) {
    close();
    throw new Error("Could not create a voice connection offer.");
  }

  const query = new URLSearchParams({
    level: options.level,
    register: options.register,
    eagerness: options.eagerness,
  });
  const response = await fetch(`/api/japanese/practice-realtime?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offer.sdp,
  });
  if (!response.ok) {
    const message = await errorFromResponse(response);
    close();
    throw new Error(message);
  }

  const answerSdp = await response.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return {
    close,
    setMuted: (muted) => {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind === "audio") sender.track.enabled = !muted;
      }
    },
    interrupt: () => {
      send({ type: "response.cancel" });
      send({ type: "output_audio_buffer.clear" });
    },
    sendText: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      });
      send({ type: "response.create" });
    },
    updateEagerness: (eagerness) => {
      send({
        type: "session.update",
        session: {
          type: "realtime",
          audio: {
            input: {
              turn_detection: {
                type: "semantic_vad",
                eagerness,
                create_response: true,
                interrupt_response: true,
              },
            },
          },
        },
      });
    },
  };
}
