import { useEffect, useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClusterExplorerLayout } from "./ClusterExplorerLayout";

vi.mock("@/contexts/SelectedClusterContext", () => ({
  useSelectedCluster: () => ({ setSelectedClusterId: vi.fn() }),
}));
vi.mock("@/components/user-management/hooks/useClusters", () => ({
  useClusters: () => ({ clusterOptions: [{ id: "physical:one", name: "one", displayName: "one", isLogical: false }] }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange: (value: string) => void; children: ReactNode }) => (
    <select aria-label="Cluster" value={value ?? ""} onChange={(event) => onValueChange(event.target.value)}>
      <option value="" />{children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));
vi.mock("@/components/DatabaseSelector", () => ({
  DatabaseSelector: ({ onSelect, value }: { onSelect: (database: string) => void; value: string }) => (
    <select aria-label="Database" value={value} onChange={(event) => onSelect(event.target.value)}>
      <option value="" /><option value="first">first</option><option value="second">second</option>
    </select>
  ),
}));
vi.mock("@/components/DatabaseExplorer", () => ({
  DatabaseExplorer: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Hide table explorer</button>,
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves content state and the explorer width through resizing, hide/show, database changes, and refresh", () => {
  const onMount = vi.fn();
  function StatefulContent() {
    const [sql, setSql] = useState("");
    useEffect(() => { onMount(); }, []);
    return <input aria-label="SQL" value={sql} onChange={(event) => setSql(event.target.value)} />;
  }
  render(
    <ClusterExplorerLayout showExplorer explorerWidthStorageKey="query-editor-explorer-width">
      {() => <StatefulContent />}
    </ClusterExplorerLayout>,
  );
  fireEvent.change(screen.getByLabelText("Cluster"), { target: { value: "physical:one" } });
  const sqlInput = screen.getByLabelText("SQL");
  fireEvent.change(sqlInput, { target: { value: "SELECT 42" } });
  fireEvent.change(screen.getByLabelText("Database"), { target: { value: "first" } });

  const handle = screen.getByRole("separator", { name: "Resize table explorer" });
  fireEvent.keyDown(handle, { key: "End" });
  expect(document.getElementById(handle.getAttribute("aria-controls")!)).toHaveStyle({ width: "600px" });
  fireEvent.click(screen.getByRole("button", { name: "Hide table explorer" }));
  expect(screen.queryByRole("separator")).toBeNull();
  expect(screen.getByLabelText("SQL")).toBe(sqlInput);
  fireEvent.click(screen.getByRole("button", { name: "Explorer" }));
  expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "600");
  fireEvent.change(screen.getByLabelText("Database"), { target: { value: "second" } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh table list" }));
  expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "600");
  expect(screen.getByLabelText("SQL")).toBe(sqlInput);
  expect(sqlInput).toHaveValue("SELECT 42");
  expect(onMount).toHaveBeenCalledTimes(1);
});

it("shows the handle only when the explorer is open with a selected database", () => {
  render(<ClusterExplorerLayout showExplorer>{() => <div>Content</div>}</ClusterExplorerLayout>);
  expect(screen.queryByRole("separator")).toBeNull();
  fireEvent.change(screen.getByLabelText("Cluster"), { target: { value: "physical:one" } });
  expect(screen.queryByRole("separator")).toBeNull();
  fireEvent.change(screen.getByLabelText("Database"), { target: { value: "first" } });
  expect(screen.getByRole("separator")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Database"), { target: { value: "" } });
  expect(screen.queryByRole("separator")).toBeNull();
});
