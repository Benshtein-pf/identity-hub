/**
 * Minimal plain-text -> Atlassian Document Format converter. Jira's v3 issue
 * API requires `description` as ADF, not a plain string. We only need enough
 * of ADF to round-trip a user-typed finding description: paragraphs split on
 * blank lines, no rich formatting.
 */
interface AdfTextNode {
  type: "text";
  text: string;
}

interface AdfParagraph {
  type: "paragraph";
  content: AdfTextNode[];
}

export interface AdfDocument {
  type: "doc";
  version: 1;
  content: AdfParagraph[];
}

export function textToAdf(text: string): AdfDocument {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const content: AdfParagraph[] =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => ({ type: "paragraph", content: [{ type: "text", text: paragraph }] }))
      : [{ type: "paragraph", content: [] }];

  return { type: "doc", version: 1, content };
}
