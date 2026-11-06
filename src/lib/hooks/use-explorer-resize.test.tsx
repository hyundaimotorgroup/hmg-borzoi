import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExplorerResize } from "./use-explorer-resize";

let containerWidth = 1200;
const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];

function Harness({ active = true, storageKey = "explorer-test" }: { active?: boolean; storageKey?: string }) {
  const { containerRef, width, minWidth, maxWidth, isDragging, handleProps } = useExplorerResize(active, storageKey);
  return (
    <div ref={containerRef}>
      <div
        role="separator"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        data-dragging={isDragging}
        {...handleProps}
      />
    </div>
  );
}

function preparePointerCapture() {
  const handle = screen.getByRole("separator");
  let captured: number | null = null;
  Object.assign(handle, {
    setPointerCapture: vi.fn((id: number) => { captured = id; }),
    hasPointerCapture: vi.fn((id: number) => captured === id),
    releasePointerCapture: vi.fn(() => { captured = null; }),
  });
  return handle;
}

function resizeContainer(width: number) {
  containerWidth = width;
  act(() => observers.at(-1)?.callback([], {} as ResizeObserver));
}

beforeEach(() => {
  containerWidth = 1200;
  observers.length = 0;
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    width: containerWidth, height: 700, x: 0, y: 0, top: 0, left: 0,
    right: containerWidth, bottom: 700, toJSON: () => ({}),
  }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) {
      observers.push({ callback, disconnect: this.disconnect });
    }
    observe = vi.fn();
    disconnect = vi.fn();
  });
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.isPrimary = init.isPrimary ?? true;
    }
  });
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useExplorerResize", () => {
  it("starts at 200px and saves only when a drag finishes, including the final position", () => {
    render(<Harness />);
    const handle = preparePointerCapture();
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    fireEvent.pointerDown(handle, { clientX: 200 });
    fireEvent.pointerMove(handle, { clientX: 360 });
    expect(handle).toHaveAttribute("aria-valuenow", "360");
    expect(window.localStorage.getItem("explorer-test")).toBeNull();
    fireEvent.pointerUp(handle, { clientX: 380 });
    expect(handle).toHaveAttribute("aria-valuenow", "380");
    expect(window.localStorage.getItem("explorer-test")).toBe("380");
    expect(handle).toHaveAttribute("data-dragging", "false");
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("clamps dragging in both directions to 200–600px", () => {
    render(<Harness />);
    const handle = preparePointerCapture();
    fireEvent.pointerDown(handle, { clientX: 200 });
    fireEvent.pointerMove(handle, { clientX: 2000 });
    expect(handle).toHaveAttribute("aria-valuenow", "600");
    fireEvent.pointerMove(handle, { clientX: -100 });
    expect(handle).toHaveAttribute("aria-valuenow", "200");
  });

  it("reserves 400px for content and restores the preference after the window grows", () => {
    window.localStorage.setItem("explorer-test", "550");
    render(<Harness />);
    const handle = screen.getByRole("separator");
    resizeContainer(750);
    expect(handle).toHaveAttribute("aria-valuemax", "326");
    expect(handle).toHaveAttribute("aria-valuenow", "326");
    expect(window.localStorage.getItem("explorer-test")).toBe("550");
    resizeContainer(500);
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    resizeContainer(1200);
    expect(handle).toHaveAttribute("aria-valuenow", "550");
  });

  it("starts dragging at the displayed width when the saved preference exceeds available space", () => {
    window.localStorage.setItem("explorer-test", "550");
    containerWidth = 750;
    render(<Harness />);
    const handle = preparePointerCapture();
    fireEvent.pointerDown(handle, { clientX: 326 });
    fireEvent.pointerUp(handle, { clientX: 300 });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    expect(window.localStorage.getItem("explorer-test")).toBe("300");
  });

  it.each([
    { interaction: "a click without movement", positions: [] },
    { interaction: "a drag beyond the current bound", positions: [500] },
    { interaction: "a drag back to its starting width", positions: [300, 326] },
  ])("keeps the saved preference after $interaction", ({ positions }) => {
    window.localStorage.setItem("explorer-test", "550");
    containerWidth = 750;
    render(<Harness />);
    const handle = preparePointerCapture();
    vi.mocked(window.localStorage.setItem).mockClear();
    fireEvent.pointerDown(handle, { clientX: 326 });
    for (const clientX of positions) fireEvent.pointerMove(handle, { clientX });
    fireEvent.pointerUp(handle, { clientX: positions.at(-1) ?? 326 });
    expect(handle).toHaveAttribute("aria-valuenow", "326");
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("explorer-test")).toBe("550");
    expect(handle).toHaveAttribute("data-dragging", "false");
    expect(document.body.style.userSelect).toBe("");
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    resizeContainer(1200);
    expect(handle).toHaveAttribute("aria-valuenow", "550");
  });

  it.each([
    { key: "ArrowRight", container: 750, displayedWidth: 326 },
    { key: "End", container: 750, displayedWidth: 326 },
    { key: "ArrowLeft", container: 500, displayedWidth: 200 },
    { key: "Home", container: 500, displayedWidth: 200 },
    { key: "ArrowRight", container: 500, displayedWidth: 200 },
    { key: "End", container: 500, displayedWidth: 200 },
  ])("keeps the saved preference when $key cannot change width in a $container px container", ({ key, container, displayedWidth }) => {
    window.localStorage.setItem("explorer-test", "550");
    containerWidth = container;
    render(<Harness />);
    const handle = screen.getByRole("separator");
    vi.mocked(window.localStorage.setItem).mockClear();
    fireEvent.keyDown(handle, { key });
    expect(handle).toHaveAttribute("aria-valuenow", String(displayedWidth));
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("explorer-test")).toBe("550");
    resizeContainer(1200);
    expect(handle).toHaveAttribute("aria-valuenow", "550");
  });

  it("remeasures the container when the explorer is shown again", () => {
    window.localStorage.setItem("explorer-test", "550");
    const { rerender } = render(<Harness />);
    rerender(<Harness active={false} />);
    containerWidth = 750;
    rerender(<Harness />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "326");
    expect(window.localStorage.getItem("explorer-test")).toBe("550");
  });

  it("resizes by keyboard and respects the current bounds", () => {
    containerWidth = 750;
    render(<Harness />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "216");
    expect(window.localStorage.getItem("explorer-test")).toBe("216");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "326");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "326");
    fireEvent.keyDown(handle, { key: "Home" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "200");
  });

  it("restores separate preferences for each screen and after remounting", () => {
    window.localStorage.setItem("queries", "320");
    window.localStorage.setItem("databases", "480");
    const { rerender, unmount } = render(<Harness storageKey="queries" />);
    const handle = screen.getByRole("separator");
    expect(handle).toHaveAttribute("aria-valuenow", "320");
    rerender(<Harness storageKey="databases" />);
    expect(handle).toHaveAttribute("aria-valuenow", "480");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(window.localStorage.getItem("queries")).toBe("320");
    expect(window.localStorage.getItem("databases")).toBe("496");
    unmount();
    render(<Harness storageKey="databases" />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "496");
  });

  it.each(["garbage", "NaN", "Infinity", "199", "601", "", "null", "300.5", "0x12c", "3e2", "300.0"])("ignores invalid stored width %s", (stored) => {
    window.localStorage.setItem("explorer-test", stored);
    render(<Harness />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "200");
  });

  it("keeps resizing available when storage reads and writes fail", () => {
    vi.mocked(window.localStorage.getItem).mockImplementation(() => { throw new Error("Storage disabled"); });
    vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error("Storage disabled"); });
    render(<Harness />);
    const handle = screen.getByRole("separator");
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "216");
  });

  it.each(["pointerCancel", "lostPointerCapture", "Escape"])("cleans up a canceled drag via %s without overwriting the preference", (cancel) => {
    window.localStorage.setItem("explorer-test", "300");
    document.body.style.setProperty("user-select", "text", "important");
    render(<Harness />);
    const handle = preparePointerCapture();
    fireEvent.pointerDown(handle, { clientX: 300 });
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerMove(handle, { clientX: 400 });
    if (cancel === "Escape") fireEvent.keyDown(handle, { key: "Escape" });
    else if (cancel === "pointerCancel") fireEvent.pointerCancel(handle);
    else fireEvent.lostPointerCapture(handle);
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    expect(handle).toHaveAttribute("data-dragging", "false");
    expect(document.body.style.userSelect).toBe("text");
    expect(document.body.style.getPropertyPriority("user-select")).toBe("important");
    expect(window.localStorage.getItem("explorer-test")).toBe("300");
  });

  it("ignores non-primary buttons and other pointer IDs during a drag", () => {
    render(<Harness />);
    const handle = preparePointerCapture();
    fireEvent.pointerDown(handle, { clientX: 200, button: 2 });
    fireEvent.pointerDown(handle, { clientX: 200, isPrimary: false });
    expect(handle.setPointerCapture).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientX: 500, pointerId: 2 });
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    expect(handle).toHaveAttribute("data-dragging", "true");
  });

  it("cleans up capture, styles, and observers when hiding or unmounting during a drag", () => {
    const { rerender, unmount } = render(<Harness />);
    const handle = preparePointerCapture();
    fireEvent.pointerDown(handle, { clientX: 200 });
    fireEvent.pointerMove(handle, { clientX: 400 });
    rerender(<Harness active={false} />);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(document.body.style.userSelect).toBe("");
    expect(handle).toHaveAttribute("data-dragging", "false");
    expect(observers[0].disconnect).toHaveBeenCalled();
    rerender(<Harness />);
    fireEvent.pointerDown(handle, { clientX: 200 });
    unmount();
    expect(document.body.style.userSelect).toBe("");
    expect(observers.at(-1)?.disconnect).toHaveBeenCalled();
  });
});
