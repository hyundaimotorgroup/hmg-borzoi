import dns from "dns";
import net from "net";
import type { LookupFunction } from "net";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b, c] = parts;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata: 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
  if (normalized.startsWith("ff")) return true; // ff00::/8 multicast

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

/**
 * Resolves `hostname` (or parses it directly if it's already an IP literal) and
 * returns true if any resolved address is loopback/private/link-local/multicast/
 * reserved (including the 169.254.169.254 cloud metadata endpoint), or if
 * resolution fails. DNS is checked for every address (not just the first) to
 * guard against DNS-rebinding style bypasses.
 */
export async function isPrivateOrReservedHost(hostname: string): Promise<boolean> {
  const directIpVersion = net.isIP(hostname);
  if (directIpVersion) {
    return isPrivateOrReservedIp(hostname);
  }

  try {
    const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) return true;
    return addresses.some((addr) => isPrivateOrReservedIp(addr.address));
  } catch {
    return true;
  }
}

/**
 * Returns a `dns.lookup`-compatible function that rejects any resolved address
 * that is private/loopback/reserved, for use as the `lookup` option of
 * `http.request`/`https.request`/`net.createConnection`/`tls.connect`. Using
 * this as the *actual* resolver for the outgoing connection (rather than only
 * checking the hostname ahead of time with `isPrivateOrReservedHost`) closes
 * the DNS-rebinding gap where a hostname could resolve to a public IP at
 * validation time and a private/internal IP at connection time.
 */
export function createSafeLookup(): LookupFunction {
  return function safeLookup(hostname, lookupOptions, callback) {
    dns.lookup(hostname, { ...lookupOptions, all: true }, (err, addresses) => {
      if (err) return callback(err, "");

      const list = addresses as dns.LookupAddress[];
      if (list.length === 0) {
        return callback(new Error(`DNS lookup for ${hostname} returned no addresses`), "");
      }

      const blocked = list.find((addr) => isPrivateOrReservedIp(addr.address));
      if (blocked) {
        return callback(
          new Error(`Resolved address ${blocked.address} for ${hostname} is private, loopback, or reserved and is not allowed`),
          ""
        );
      }

      if (lookupOptions.all) {
        return callback(null, list);
      }

      const chosen = list.find((addr) => !lookupOptions.family || addr.family === lookupOptions.family) ?? list[0];
      callback(null, chosen.address, chosen.family);
    });
  };
}
