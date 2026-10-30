import { NextResponse } from 'next/server';
import { fetchBadReplicasDetail } from '@/lib/services/cluster.service';
import { withClusterAccess } from '@/lib/auth/middleware';

export const GET = withClusterAccess(async (_request, { params }, user) => {
  try {
    const { id } = await params;
    const badReplicasDetail = await fetchBadReplicasDetail(id, user?.id);
    return NextResponse.json({ badReplicasDetail });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch bad replicas' }, { status: 500 });
  }
});
