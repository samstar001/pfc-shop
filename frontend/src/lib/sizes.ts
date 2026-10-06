// "38-46" → [38..46];  "38, 40, 42-44" → [38, 40, 42, 43, 44]
export function parseSizes(input: string): number[] {
  const sizes = new Set<number>();

  for (const part of input.split(",")) {
    const text = part.trim();
    if (!text) continue;

    // A range like 38-46
    const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Math.min(Number(range[1]), Number(range[2]));
      const to = Math.max(Number(range[1]), Number(range[2]));
      for (let n = from; n <= to && sizes.size < 60; n++) sizes.add(n);
    } else if (/^\d+$/.test(text)) {
      sizes.add(Number(text)); // a single size
    }
  }

  return [...sizes].sort((a, b) => a - b);
}
