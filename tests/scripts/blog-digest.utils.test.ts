import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  extractFeaturedPostSlug,
  extractFeaturedPostTitle,
  extractText,
} from "../../scripts/blog-digest.utils.js";

// Representative Webflow listing HTML. Matches the actual structure of
// oasis.security/blog: featured post in blog_main-post, older posts below.
const WEBFLOW_LISTING = `
<!DOCTYPE html>
<html>
<head><title>Blog | Oasis Security</title></head>
<body>
  <nav><a href="/about">About</a><a href="/">Home</a></nav>
  <section class="blog_main-post">
    <div class="blog_main-list-wrapper w-dyn-list">
      <div role="list" class="blog_main-list w-dyn-items">
        <div role="listitem" class="blog_main-item w-dyn-item">
          <a href="/blog/oasis-zscaler-partnership" class="blog_main-item-link w-inline-block">
            <div class="blog_image-wrapper"><img alt="" /></div>
            <div class="blog_main-content">
              <h2 class="heading-style-h4">Extending Zero Trust to Non-Human &amp; Agentic Identities</h2>
            </div>
          </a>
        </div>
      </div>
    </div>
  </section>
  <section class="blog_secondary-posts">
    <a href="/blog/second-post">Second post</a>
    <a href="/blog/third-post">Third post</a>
  </section>
</body>
</html>
`;

// ── decodeEntities ────────────────────────────────────────────────────────────

describe("decodeEntities", () => {
  it("decodes &amp; &lt; &gt; &quot;", () => {
    expect(decodeEntities("&amp;&lt;&gt;&quot;")).toBe(`&<>"`);
  });

  it("decodes &#x27; and &apos;", () => {
    expect(decodeEntities("&#x27;&apos;")).toBe("''");
  });

  it("decodes decimal numeric entity", () => {
    expect(decodeEntities("&#38;")).toBe("&");
  });

  it("decodes hex numeric entity", () => {
    expect(decodeEntities("&#x26;")).toBe("&");
  });

  it("leaves plain text unchanged", () => {
    expect(decodeEntities("hello world")).toBe("hello world");
  });

  it("decodes multiple entities in a realistic title", () => {
    expect(decodeEntities("Non-Human &amp; Agentic Identities")).toBe(
      "Non-Human & Agentic Identities",
    );
  });
});

// ── extractText ───────────────────────────────────────────────────────────────

describe("extractText", () => {
  it("strips <script> blocks entirely", () => {
    expect(extractText("<p>visible</p><script>var x = 1;</script>")).toBe("visible");
  });

  it("strips multiline <script> blocks with embedded HTML", () => {
    const html = `<p>before</p><script>
      document.querySelector('p').innerHTML = '<b>injected</b>';
    </script><p>after</p>`;
    expect(extractText(html)).toBe("before after");
  });

  it("strips <style> blocks", () => {
    expect(extractText("<p>visible</p><style>.foo { color: red }</style>")).toBe("visible");
  });

  it("strips HTML tags", () => {
    expect(extractText("<b>bold</b> text")).toBe("bold text");
  });

  it("decodes entities after stripping tags", () => {
    expect(extractText("<b>bold &amp; brave</b>")).toBe("bold & brave");
  });

  it("collapses whitespace", () => {
    expect(extractText("<p>one</p>\n   <p>two</p>")).toBe("one two");
  });
});

// ── extractFeaturedPostSlug ───────────────────────────────────────────────────

describe("extractFeaturedPostSlug", () => {
  it("returns the first /blog/<slug> href in the page", () => {
    expect(extractFeaturedPostSlug(WEBFLOW_LISTING)).toBe(
      "/blog/oasis-zscaler-partnership",
    );
  });

  it("returns null when no /blog/ link is present", () => {
    expect(extractFeaturedPostSlug("<a href='/about'>About</a>")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractFeaturedPostSlug("")).toBeNull();
  });

  it("does not match non-blog paths", () => {
    expect(extractFeaturedPostSlug("<a href='/blogroll'>Not a post</a>")).toBeNull();
  });
});

// ── extractFeaturedPostTitle ──────────────────────────────────────────────────

describe("extractFeaturedPostTitle", () => {
  it("extracts and decodes the heading from the blog_main-post block", () => {
    expect(extractFeaturedPostTitle(WEBFLOW_LISTING)).toBe(
      "Extending Zero Trust to Non-Human & Agentic Identities",
    );
  });

  it("decodes HTML entities in the title", () => {
    const html = `
      <div class="blog_main-post">
        <a href="/blog/x"><h2>Title &amp; Subtitle &#x27;quoted&#x27;</h2></a>
      </div>`;
    expect(extractFeaturedPostTitle(html)).toBe("Title & Subtitle 'quoted'");
  });

  it("strips inner HTML tags from the heading text", () => {
    const html = `
      <div class="blog_main-post">
        <a href="/blog/x"><h2>Post <span class="tag">NHI</span> Security</h2></a>
      </div>`;
    expect(extractFeaturedPostTitle(html)).toBe("Post NHI Security");
  });

  it("extracts title even when a nested anchor appears before the heading", () => {
    const html = `
      <div class="blog_main-post">
        <a href="/blog/x" class="blog_main-item-link">
          <a href="/images/cover"><img alt="" /></a>
          <h2>Title After Nested Anchor</h2>
        </a>
      </div>`;
    expect(extractFeaturedPostTitle(html)).toBe("Title After Nested Anchor");
  });

  it("ignores headings that appear before the featured block", () => {
    const html = `
      <h1>Page Title</h1>
      <div class="blog_main-post">
        <a href="/blog/x"><h2>Featured Post</h2></a>
      </div>
      <h3>Sidebar heading</h3>`;
    expect(extractFeaturedPostTitle(html)).toBe("Featured Post");
  });

  it("returns null when the blog_main-post block is absent", () => {
    expect(extractFeaturedPostTitle("<h2>No block here</h2>")).toBeNull();
  });

  it("returns null when no heading is inside the block", () => {
    const html = `<div class="blog_main-post"><p>No heading</p></div>`;
    expect(extractFeaturedPostTitle(html)).toBeNull();
  });

  it("matches h1 through h6 headings", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const html = `<div class="blog_main-post"><a href="/blog/x"><h${level}>Level ${level}</h${level}></a></div>`;
      expect(extractFeaturedPostTitle(html)).toBe(`Level ${level}`);
    }
  });
});
