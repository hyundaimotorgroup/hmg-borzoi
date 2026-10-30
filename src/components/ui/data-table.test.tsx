import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";

vi.mock("@/components/ui/pagination-bar", () => ({
  PaginationBar: () => <div data-testid="pagination-bar" />,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 34,
        end: (i + 1) * 34,
        size: 34,
        key: i,
        lane: 0,
      })),
    getTotalSize: () => count * 34,
    measureElement: () => {},
  }),
}));

interface Row {
  name: string;
  age: number;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age", enableSorting: true },
];

const data: Row[] = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Carol", age: 35 },
];

describe("DataTable", () => {
  it("renders header cells and data cells with provided data", () => {
    render(<DataTable columns={columns} data={data} />);

    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("Age")).toBeDefined();

    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.getByText("Carol")).toBeDefined();
    expect(screen.getByText("30")).toBeDefined();
    expect(screen.getByText("25")).toBeDefined();
    expect(screen.getByText("35")).toBeDefined();
  });

  it("shows emptyMessage when data is empty", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyMessage="Nothing to display"
      />,
    );

    expect(screen.getByText("Nothing to display")).toBeDefined();
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("uses default emptyMessage when none provided", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText("No data found.")).toBeDefined();
  });

  it("renders loading skeletons instead of data when isLoading=true", () => {
    render(<DataTable columns={columns} data={[]} isLoading={true} />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.queryByText("No data found.")).toBeNull();
  });

  it("shows loading skeletons even when data is provided", () => {
    render(<DataTable columns={columns} data={data} isLoading={true} />);

    expect(screen.queryByText("Alice")).toBeNull();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("toggles sort direction on repeated clicks of a sortable header", () => {
    const sortableColumns: ColumnDef<Row>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "age", header: "Age", enableSorting: true },
    ];

    render(<DataTable columns={sortableColumns} data={data} />);

    const ageHeader = screen.getByText("Age").closest("div")!;
    const getAgeCells = () =>
      screen
        .getAllByRole("cell")
        .map((c) => c.textContent ?? "")
        .filter((v) => ["25", "30", "35"].includes(v));

    fireEvent.click(ageHeader);
    const firstSort = getAgeCells();

    const isOrdered =
      JSON.stringify(firstSort) === JSON.stringify(["25", "30", "35"]) ||
      JSON.stringify(firstSort) === JSON.stringify(["35", "30", "25"]);
    expect(isOrdered).toBe(true);

    fireEvent.click(ageHeader);
    const secondSort = getAgeCells();

    const isOppositeOrdered =
      JSON.stringify(secondSort) === JSON.stringify(["25", "30", "35"]) ||
      JSON.stringify(secondSort) === JSON.stringify(["35", "30", "25"]);
    expect(isOppositeOrdered).toBe(true);
    expect(firstSort).not.toEqual(secondSort);
  });
});
