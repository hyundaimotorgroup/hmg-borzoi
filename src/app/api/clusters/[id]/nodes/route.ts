import { NextRequest, NextResponse } from 'next/server';
import { fetchNodeList } from '@/lib/services/cluster.service';
import { withClusterAccess } from '@/lib/auth/middleware';

export const GET = withClusterAccess(async (_request: NextRequest, { params }, user) => {
  try {
    const { id } = await params;
    const nodeDetails = await fetchNodeList(id, user.id);
    return NextResponse.json({ nodeDetails });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch node list' }, { status: 500 });
  }
});
