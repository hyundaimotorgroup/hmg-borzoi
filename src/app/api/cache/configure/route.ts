import { logger } from "@/lib/utils/logger";
import { NextResponse } from 'next/server';
import { metricsCache } from '@/lib/cache/metrics-cache';
import { timeseriesCache } from '@/lib/cache/timeseries-cache';
import { withRole } from '@/lib/auth/middleware';
import { cacheConfigureSchema, parseRequestJson } from '@/lib/validation';

/**
 * POST /api/cache/configure
 * ()
 *
 * Request body:
 * {
 *   "ttl": 30  // TTL in seconds
 * }
 *
 * :
 * { "success": true, "ttl": 30 }
 */
export const POST = withRole(async (request, _context, _user) => {
  try {
    const parsed = await parseRequestJson(request, cacheConfigureSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const { ttl } = parsed.data;

    metricsCache.setTTL(ttl);
    timeseriesCache.setTTL(ttl);

    return NextResponse.json({
      success: true,
      ttl,
      message: `Cache TTL set to ${ttl} seconds`
    });
  } catch (error) {
    logger.error('Error configuring cache:', error);
    return NextResponse.json(
      { error: 'Failed to configure cache' },
      { status: 500 }
    );
  }
}, ['admin']);
