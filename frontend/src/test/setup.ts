import "@testing-library/jest-dom";

// jsdom does not implement navigator.clipboard. Define a configurable stub so
// tests can spy on individual methods without hitting TypeError on undefined.
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue("")
  },
  configurable: true,
  writable: true
});
