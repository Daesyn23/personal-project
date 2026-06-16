"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const jpFontClass =
  "[font-family:ui-sans-serif,'Hiragino_Sans','Hiragino_Kaku_Gothic_ProN','Yu_Gothic_UI','Yu_Gothic',Meiryo,sans-serif]";

const proseEnglish = "font-[family-name:ui-serif,Georgia,Cambria,'Times_New_Roman',serif]";

function isTaglishSection(title: string): boolean {
  return /taglish/i.test(title);
}

const markdownComponents: Components = {
  h2: ({ children }) => {
    const title = String(children ?? "");
    const taglish = isTaglishSection(title);
    return (
      <h2
        className={`mt-8 scroll-mt-4 border-b pb-2 text-base font-bold tracking-tight first:mt-0 sm:text-lg ${
          taglish
            ? "border-amber-200/90 text-amber-950"
            : "border-violet-200/90 text-violet-950"
        }`}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => (
    <h3
      className={`mt-5 text-sm font-bold text-neutral-900 sm:text-[0.95rem] ${jpFontClass}`}
    >
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className={`mt-3 text-sm leading-relaxed text-neutral-700 ${proseEnglish}`}>{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-neutral-800">{children}</em>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700 marker:text-violet-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-neutral-700 marker:font-semibold marker:text-violet-700">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className={`pl-1 ${proseEnglish}`}>
      <div className="space-y-2 [&>ol]:mt-2 [&>ul]:mt-2">{children}</div>
    </li>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-xl border border-violet-100/90 bg-white/80 shadow-sm ring-1 ring-violet-50">
      <table className="min-w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-violet-100 bg-violet-50/80 text-xs font-bold uppercase tracking-wide text-violet-900">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-violet-50">{children}</tbody>,
  tr: ({ children }) => <tr className="align-top">{children}</tr>,
  th: ({ children }) => (
    <th className={`px-3 py-2.5 sm:px-4 ${jpFontClass}`}>{children}</th>
  ),
  td: ({ children }) => (
    <td className={`px-3 py-2.5 text-neutral-700 sm:px-4 ${jpFontClass}`}>{children}</td>
  ),
  hr: () => <hr className="my-6 border-violet-100" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-4 border-violet-300/70 bg-violet-50/40 py-1 pl-4 text-sm italic text-neutral-700">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-violet-100/70 px-1.5 py-0.5 font-mono text-[0.85em] text-violet-900">
      {children}
    </code>
  ),
};

type Props = {
  markdown: string;
  className?: string;
};

export function LessonNotesMarkdown({ markdown, className = "" }: Props) {
  const sections = markdown.split(/(?=^## )/m).filter(Boolean);

  return (
    <div className={`space-y-2 ${className}`}>
      {sections.map((section, i) => {
        const headingMatch = /^## (.+)$/m.exec(section);
        const heading = headingMatch?.[1]?.trim() ?? "";
        const taglish = isTaglishSection(heading);

        return (
          <div
            key={i}
            className={
              taglish
                ? "rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 px-4 py-3 sm:px-5 sm:py-4"
                : undefined
            }
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {section.trim()}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
