export type KanjiShape = {
  character: string;
  paths: string[];
  parts: { label: string; original: string; strokes: number[] }[];
};

export function kanjiShapeUrl(character: string): string {
  const point = character.codePointAt(0);
  if (point === undefined || [...character].length !== 1) throw new Error("Expected one kanji");
  return `/learning/kanji/shapes/${point.toString(16).padStart(5, "0")}.json`;
}

/** Familiar labels for the visual parts, not claims about a character's etymology. */
const labels: Record<string, string> = {
  人: "person", 亻: "person", 木: "tree", 口: "mouth", 日: "sun", 月: "moon",
  水: "water", 氵: "water", 火: "fire", 灬: "fire", 手: "hand", 扌: "hand", 又: "hand",
  目: "eye", 耳: "ear", 心: "heart", 忄: "heart", 田: "field", 禾: "grain", 宀: "roof",
  門: "gate", 糸: "thread", 鳥: "bird", 隹: "bird", 山: "mountain", 土: "soil",
  金: "metal", 足: "foot", 食: "food", 艹: "plants", 力: "strength", 竹: "bamboo",
  石: "stone", 貝: "shell", 女: "woman", 子: "child", 刀: "blade", 刂: "blade",
  王: "king", 玉: "jewel", 雨: "rain", 車: "cart", 馬: "horse", 牛: "cow", 羊: "sheep",
  犬: "dog", 犭: "animal", 言: "words", 大: "big", 小: "small", 白: "white", 米: "rice",
};

export function kanjiPartLabel(part: KanjiShape["parts"][number], index: number): string {
  const hint = labels[part.label] || labels[part.original];
  return part.label ? `${part.label}${hint ? ` · ${hint}` : ""}` : `Other strokes ${index + 1}`;
}
