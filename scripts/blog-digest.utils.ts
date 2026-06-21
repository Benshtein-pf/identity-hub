export function decodeEntities(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match: string, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_match: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
}

export function extractText(html: string): string {
  const noScripts = stripScriptsAndStyles(html);
  const noTags = noScripts.replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

// Returns the href of the first /blog/<slug> link in the page. On the
// Webflow-hosted oasis.security/blog, this is always the featured post anchor.
export function extractFeaturedPostSlug(html: string): string | null {
  return html.match(/href="(\/blog\/[^"]+)"/)?.[1] ?? null;
}

// Finds the blog_main-post featured block and returns the decoded, tag-stripped
// text of its first heading element. Returns null if either is absent.
export function extractFeaturedPostTitle(html: string): string | null {
  const mainBlock = html.match(/blog_main-post[\s\S]*?<\/a>/)?.[0];
  if (!mainBlock) return null;
  const headingInner = mainBlock.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
  if (!headingInner) return null;
  return decodeEntities(headingInner.replace(/<[^>]+>/g, "")).trim() || null;
}
