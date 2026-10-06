// "PFC Classic Slide!" → "pfc-classic-slide" (used for page URLs)
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-") // anything else becomes a dash
    .replace(/^-+|-+$/g, "") // trim dashes
    .slice(0, 80);
}
