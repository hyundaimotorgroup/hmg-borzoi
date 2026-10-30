import { describe, expect, it } from "vitest";

import {
  buildClusterFormSchema,
  clusterCredentialTestSchema,
  clusterConnectionTestSchema,
  createClusterSchema,
  updateClusterSchema,
} from "./cluster";

describe("cluster validation", () => {
  it("coerces create payload port values", () => {
    const result = createClusterSchema.parse({
      name: "Prod Cluster",
      host: "clickhouse.example.com",
      port: "8123",
      protocol: "http",
      username: "monitor",
      password: "secret",
      useTLS: false,
      environment: "prod",
    });

    expect(result.port).toBe(8123);
  });

  it("allows blank passwords in edit mode form schema", () => {
    const result = buildClusterFormSchema(true).safeParse({
      name: "Prod Cluster",
      host: "clickhouse.example.com",
      port: 8123,
      protocol: "http",
      username: "monitor",
      password: "",
      useTLS: false,
      environment: "prod",
    });

    expect(result.success).toBe(true);
  });

  it("requires passwords in create mode form schema", () => {
    const result = buildClusterFormSchema(false).safeParse({
      name: "Prod Cluster",
      host: "clickhouse.example.com",
      port: 8123,
      protocol: "http",
      username: "monitor",
      password: "",
      useTLS: false,
      environment: "prod",
    });

    expect(result.success).toBe(false);
  });

  it("allows omitted passwords in update payloads", () => {
    const result = updateClusterSchema.safeParse({
      name: "Prod Cluster",
      host: "clickhouse.example.com",
      port: 8123,
      protocol: "http",
      username: "monitor",
      useTLS: true,
      environment: "prod",
    });

    expect(result.success).toBe(true);
  });

  it("requires credentials for connection tests", () => {
    const result = clusterConnectionTestSchema.safeParse({
      host: "clickhouse.example.com",
      port: 8123,
      protocol: "http",
      username: "monitor",
      password: "",
      useTLS: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires username and password for cluster credential tests", () => {
    const result = clusterCredentialTestSchema.safeParse({
      username: "monitor",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});
