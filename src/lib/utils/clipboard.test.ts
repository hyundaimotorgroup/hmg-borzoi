import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeTextSafe } from "./clipboard";

describe("writeTextSafe", () => {
  beforeEach(() => {
    // jsdom doesn't implement execCommand at all.
    if (!document.execCommand) {
      (document as unknown as { execCommand: (command: string) => boolean }).execCommand = () => false;
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("insecure context (legacy execCommand fallback)", () => {
    beforeEach(() => {
      Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    });

    it("appends the scratch textarea to document.body when no dialog is open", async () => {
      let capturedParent: ParentNode | null = null;
      vi.spyOn(document, "execCommand").mockImplementation(() => {
        capturedParent = document.querySelector("textarea")?.parentNode ?? null;
        return true;
      });

      const ok = await writeTextSafe("hello");

      expect(ok).toBe(true);
      expect(capturedParent).toBe(document.body);
    });

    it("appends the scratch textarea inside an open Radix dialog instead of document.body", async () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("data-slot", "dialog-content");
      document.body.appendChild(dialog);

      let capturedParent: ParentNode | null = null;
      vi.spyOn(document, "execCommand").mockImplementation(() => {
        capturedParent = document.querySelector("textarea")?.parentNode ?? null;
        return true;
      });

      const ok = await writeTextSafe("hello from dialog");

      expect(ok).toBe(true);
      expect(capturedParent).toBe(dialog);
      // the scratch textarea must be cleaned up either way
      expect(dialog.querySelector("textarea")).toBeNull();
    });
  });
});
