const { process } = globalThis;

export function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

export function getBaseUrl(args) {
  return args.baseUrl ?? process.env.BENCHMARK_BASE_URL ?? 'http://localhost:3000';
}

export function getAuthHeaders(args = {}) {
  const userId = args.userId ?? process.env.BENCHMARK_USER_ID ?? 'benchmark-user';
  const email = args.userEmail ?? process.env.BENCHMARK_USER_EMAIL ?? 'benchmark@example.com';
  const name = args.userName ?? process.env.BENCHMARK_USER_NAME ?? 'Benchmark User';
  const role = args.userRole ?? process.env.BENCHMARK_USER_ROLE ?? 'admin';

  const userCookie = encodeURIComponent(JSON.stringify({ id: userId, email, name, role }));

  return {
    Cookie: `session=e2e-session-token; user=${userCookie}`,
  };
}

export function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

export function buildTimeRangeParams(args) {
  const params = new globalThis.URLSearchParams();

  if (args.range) {
    params.set('mode', 'relative');
    params.set('preset', args.range);
  } else if (args.from && args.to) {
    params.set('mode', 'absolute');
    params.set('from', args.from);
    params.set('to', args.to);
  } else {
    params.set('timeRange', '1h');
  }

  params.set('timezone', args.timezone ?? 'UTC');
  return params;
}
