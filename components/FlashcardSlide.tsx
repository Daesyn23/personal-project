import type { FlashcardRow } from "@/lib/types";
import type { PresentationPhase } from "@/components/presentation-phase";
import { japaneseLine } from "@/components/presentation-phase";

type Props = {
  card: FlashcardRow;
  /**
   * "word" = slide 1: Romaji → Kana (+ group) → context
   * "detail" = slide 2: same, then example + translation
   */
  phase?: PresentationPhase;
  className?: string;
};

/**
 * Romaji line: stem in textbook blue (#2196F3), polite suffix / last token in grey
 * (e.g. "sen ta ku shi" + "masu"). Uses space-separated tokens; single token uses last-char split.
 */
function PhoneticLines({ text }: { text: string | null }) {
  const t = text?.trim();
  if (!t) return null;

  const parts = t.split(/\s+/).filter(Boolean);
  const blueClass = "font-bold text-[color:var(--fc-romaji-blue)]";
  const greyClass = "font-bold text-[color:var(--fc-romaji-tail)]";

  if (parts.length === 1) {
    const w = parts[0];
    if (w.length <= 1) {
      return (
        <p className="text-center text-2xl font-bold tracking-wide sm:text-3xl">
          <span className={blueClass}>{w}</span>
        </p>
      );
    }
    const head = w.slice(0, -1);
    const lastChar = w.slice(-1);
    return (
      <p className="text-center text-2xl font-bold tracking-wide sm:text-3xl">
        <span className={blueClass}>{head}</span>
        <span className={greyClass}>{lastChar}</span>
      </p>
    );
  }

  const last = parts.pop()!;
  const head = parts.join(" ");
  return (
    <p className="text-center text-2xl font-bold tracking-wide sm:text-3xl">
      <span className={blueClass}>{head} </span>
      <span className={greyClass}>{last}</span>
    </p>
  );
}

/** English gloss + note — italic magenta/pink like textbook */
function ContextBlock({ card }: { card: FlashcardRow }) {
  const gloss = (card.definition ?? "").trim();
  const ctx = (card.context_note ?? "").trim();
  if (!gloss && !ctx) return null;
  return (
    <div className="space-y-2 text-center">
      {gloss && (
        <p
          className="text-lg italic leading-snug sm:text-xl"
          style={{ color: "var(--fc-gloss-pink)" }}
        >
          {gloss}
        </p>
      )}
      {ctx && (
        <p
          className="text-base italic leading-snug sm:text-lg"
          style={{ color: "var(--fc-gloss-pink)" }}
        >
          ({ctx})
        </p>
      )}
    </div>
  );
}

/**
 * Example romaji: sentence bold black; last word (verb) maroon with light outline
 * like “fuku o” + “sentakushimasu”
 */
function ExampleRomajiLine({ text }: { text: string }) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const verbStyle =
    "font-bold text-[color:var(--fc-example-verb)] [text-shadow:1px_0_0_#fff,-1px_0_0_#fff,0_1px_0_#fff,0_-1px_0_#fff,1px_1px_0_#fff,-1px_-1px_0_#fff]";

  if (parts.length === 1) {
    return (
      <p className="text-center text-base sm:text-lg">
        <span className={verbStyle}>{parts[0]}</span>
      </p>
    );
  }

  const last = parts.pop()!;
  const head = parts.join(" ");
  return (
    <p className="text-center text-base sm:text-lg">
      <span className="font-bold text-neutral-900">{head} </span>
      <span className={verbStyle}>{last}</span>
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

  const contextCard: FlashcardRow =
    jpLine || !def ? card : { ...card, definition: null };

  return (
    <div
      className={`flex min-h-[380px] flex-col items-stretch justify-center gap-0 rounded-2xl bg-white px-6 py-12 shadow-lg shadow-pink-100/80 ring-1 ring-pink-100/80 transition-shadow duration-300 sm:px-10 ${className}`}
    >
      <div className="flex flex-col gap-10 sm:gap-12">
        {/* 1 — Romaji (top, textbook order) */}
        {card.phonetic_reading?.trim() ? (
          <section className="min-h-0" aria-label="Romaji">
            <PhoneticLines text={card.phonetic_reading} />
          </section>
        ) : null}

        {/* 2 — Kana + verb group (large, subtle depth) */}
        <section className="text-center" aria-label="Kana">
          {jpLine ? (
            <div className="flex flex-wrap items-baseline justify-center gap-3">
              <span
                className="text-5xl font-normal leading-[1.15] tracking-tight text-neutral-900 sm:text-6xl sm:leading-[1.1]"
                style={{
                  textShadow:
                    "0 2px 4px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.9), 0 0 1px rgba(0,0,0,0.08)",
                }}
              >
                {jpLine}
              </span>
              {cat && (
                <span
                  className="align-top font-serif text-4xl font-normal leading-none text-neutral-400 sm:text-5xl lg:text-6xl"
                  aria-label={`Verb group ${cat}`}
                >
                  {cat}
                </span>
              )}
            </div>
          ) : def ? (
            <p
              className="text-4xl font-semibold leading-tight text-neutral-900 sm:text-5xl"
              style={{
                textShadow: "0 2px 4px rgba(0,0,0,0.12)",
              }}
            >
              {def}
            </p>
          ) : null}
        </section>

        {/* 3 — Gloss / context */}
        <section aria-label="Meaning">
          <ContextBlock card={contextCard} />
        </section>

        {showExamples && (
          <div className="flex flex-col gap-5 border-t border-neutral-200/80 pt-10">
            {ex1 && (
              <section aria-label="Example">
                <ExampleRomajiLine text={ex1} />
              </section>
            )}
            {ex2 && (
              <section className="text-center" aria-label="Translation">
                <p className="text-sm font-normal text-neutral-900 sm:text-base">{ex2}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
