import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { withAuth, withFeatureFlag } from '@/lib/auth/middleware';
import { isQueryEditorEnabled } from '@/lib/feature-flags';
import { prisma } from '@/lib/prisma';
import { parseRequestJson, updateSavedQuerySchema } from '@/lib/validation';

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
 * DELETE /api/saved-queries/[id]
 * 
 */
export const DELETE = withFeatureFlag(isQueryEditorEnabled, withAuth(async (_request, { params }, user) => {
  const { id } = await params;
  
  try {
 // 
    const savedQuery = await prisma.savedQuery.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!savedQuery) {
      return NextResponse.json(
        { error: 'Query not found or access denied' },
        { status: 404 }
      );
    }

    await prisma.savedQuery.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}));

/**
 * PUT /api/saved-queries/[id]
 * 
 * Body: { name?: string, query?: string }
 */
export const PUT = withFeatureFlag(isQueryEditorEnabled, withAuth(async (request, { params }, user) => {
  const { id } = await params;
  const parsed = await parseRequestJson(request, updateSavedQuerySchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const { name, query } = parsed.data;

  try {
 // 
    const existingQuery = await prisma.savedQuery.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingQuery) {
      return NextResponse.json(
        { error: 'Query not found or access denied' },
        { status: 404 }
      );
    }

    const updatedQuery = await prisma.savedQuery.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(query !== undefined ? { query } : {}),
      },
    });

    return NextResponse.json(serializeSavedQuery(updatedQuery));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}));
