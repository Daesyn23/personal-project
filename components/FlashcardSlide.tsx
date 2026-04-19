import type { FlashcardRow } from "@/lib/types";
import type { PresentationPhase } from "@/components/presentation-phase";
import { japaneseLine } from "@/components/presentation-phase";

type Props = {
  card: FlashcardRow;
  /**
   * "word" = slide 1: Kana → Romaji → context (gloss + note)
   * "detail" = slide 2: same three blocks, then Example → Example translation
   */
  phase?: PresentationPhase;
  className?: string;
};

/** Romaji: sky blue + final mora grey */
function PhoneticLines({ text }: { text: string | null }) {
  const t = text?.trim();
  if (!t) return null;
  if (t.length === 1) {
    return (
      <p className="text-center text-2xl font-medium tracking-wide sm:text-3xl">
        <span className="text-sky-500">{t}</span>
      </p>
    );
  }
  const head = t.slice(0, -1);
  const lastChar = t.slice(-1);
  return (
    <p className="text-center text-2xl font-medium tracking-wide sm:text-3xl">
      <span className="text-sky-500">{head}</span>
      <span className="text-neutral-700">{lastChar}</span>
    </p>
  );
}

/** English gloss + optional parenthetical context */
function ContextBlock({ card }: { card: FlashcardRow }) {
  const def = (card.definition ?? "").trim();
  const ctx = (card.context_note ?? "").trim();
  if (!def && !ctx) return null;
  return (
    <div className="space-y-1 text-center">
      {def && (
        <p className="text-xl font-bold text-pink-500 sm:text-2xl">{def}</p>
      )}
      {ctx && (
        <p className="text-lg font-medium text-pink-500 sm:text-xl">({ctx})</p>
      )}
    </div>
  );
}

/** Example romaji: first tokens bold black, last token bold pink */
function ExampleRomajiLine({ text }: { text: string }) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return (
      <p className="text-center text-base font-bold text-neutral-900 sm:text-lg">
        {parts[0]}
      </p>
    );
  }
  const last = parts.pop()!;
  const head = parts.join(" ");
  return (
    <p className="text-center text-base sm:text-lg">
      <span className="font-bold text-neutral-900">{head} </span>
      <span className="font-bold text-pink-500">{last}</span>
    </p>
  );
}

export function FlashcardSlide({ card, phase = "word", className = "" }: Props) {
  const jpLine = japaneseLine(card);
  const cat = card.category_label?.trim();
  const def = (card.definition ?? "").trim();
  const ex1 = (card.example_sentence ?? "").trim();
  const ex2 = (card.example_translation ?? "").trim();

  const showExamples = phase === "detail" && !!(ex1 || ex2);

  /** If English was promoted to the “kana” row, don’t repeat it in context. */
  const contextCard: FlashcardRow =
    jpLine || !def ? card : { ...card, definition: null };

  return (
    <div
      className={`flex min-h-[380px] flex-col items-stretch justify-center gap-0 rounded-2xl bg-white px-6 py-10 shadow-lg shadow-pink-100/80 ring-1 ring-pink-100 transition-shadow duration-300 sm:px-8 ${className}`}
    >
      <div className="flex flex-col gap-8">
        {/* 1 — Kana */}
        <section className="text-center">
          {jpLine ? (
            <div className="flex flex-wrap items-baseline justify-center gap-2">
              <span className="text-5xl font-normal leading-tight tracking-tight text-neutral-900 sm:text-6xl">
                {jpLine}
              </span>
              {cat && (
                <span className="align-top text-xl font-medium text-neutral-400 sm:text-2xl">
                  {cat}
                </span>
              )}
            </div>
          ) : def ? (
            <p className="text-4xl font-semibold text-neutral-900 sm:text-5xl">{def}</p>
          ) : null}
        </section>

        {/* 2 — Romaji */}
        {card.phonetic_reading?.trim() ? (
          <section className="min-h-0">
            <PhoneticLines text={card.phonetic_reading} />
          </section>
        ) : null}

        {/* 3 — Context (English gloss + note) */}
        <section>
          <ContextBlock card={contextCard} />
        </section>

        {showExamples && (
          <div className="mt-2 flex flex-col gap-6 border-t border-pink-100 pt-8">
            {/* 4 — Example */}
            {ex1 && (
              <section>
                <ExampleRomajiLine text={ex1} />
              </section>
            )}
            {/* 5 — Example translation */}
            {ex2 && (
              <section className="text-center">
                <p className="text-sm font-medium text-pink-500 sm:text-base">{ex2}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
