import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { withAuth, withFeatureFlag } from '@/lib/auth/middleware';
import { isQueryEditorEnabled } from '@/lib/feature-flags';
import { prisma } from '@/lib/prisma';
import { createSavedQuerySchema, parseRequestJson } from '@/lib/validation';

function serializeSavedQuery(query: {
  id: string;
  name: string;
  query: string;
  createdAt: Date;
}) {
  return {
    id: query.id,
    name: query.name,
    query: query.query,
    createdAt: format(query.createdAt, 'yyyy-MM-dd'),
  };
}

/**
 * GET /api/saved-queries
 * 
 */
export const GET = withFeatureFlag(isQueryEditorEnabled, withAuth(async (_request, _context, user) => {
  
  try {
    const savedQueries = await prisma.savedQuery.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        query: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      queries: savedQueries.map(serializeSavedQuery),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}));

/**
 * POST /api/saved-queries
 * 
 * Body: { name: string, query: string }
 */
export const POST = withFeatureFlag(isQueryEditorEnabled, withAuth(async (request, _context, user) => {
  const parsed = await parseRequestJson(request, createSavedQuerySchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const { name, query } = parsed.data;

  try {
    const savedQuery = await prisma.savedQuery.create({
      data: {
        userId: user.id,
        name,
        query,
      },
    });

    return NextResponse.json(serializeSavedQuery(savedQuery));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}));
