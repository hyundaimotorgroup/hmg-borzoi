/**
 * Grant cluster admin permission to a user.
 * Usage: npx tsx scripts/grant-cluster-admin.ts <user-email> <cluster-name>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function grantClusterAdmin() {
  const userEmail = process.argv[2];
  const clusterName = process.argv[3];

  if (!userEmail || !clusterName) {
    console.log('❌ Usage: npx tsx scripts/grant-cluster-admin.ts <user-email> <cluster-name>');
    console.log('   Example: npx tsx scripts/grant-cluster-admin.ts user@example.com ckc02-stg');
    process.exit(1);
  }

  try {
    // Find the user.
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      console.log('\nAvailable users:');
      const users = await prisma.user.findMany();
      users.forEach(u => console.log(`  - ${u.email} (${u.name})`));
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email} (${user.name})`);

    // Find the cluster.
    const cluster = await prisma.cluster.findFirst({
      where: {
        OR: [
          { name: clusterName },
          { name: { contains: clusterName } },
          { id: clusterName },
        ],
      },
    });

    if (!cluster) {
      console.log(`❌ Cluster not found: ${clusterName}`);
      console.log('\nAvailable clusters:');
      const clusters = await prisma.cluster.findMany();
      clusters.forEach(c => console.log(`  - ${c.name} (${c.id})`));
      process.exit(1);
    }

    console.log(`✅ Found cluster: ${cluster.name} (${cluster.id})`);

    // Grant permission via upsert.
    const access = await prisma.userClusterAccess.upsert({
      where: {
        userId_clusterId: {
          userId: user.id,
          clusterId: cluster.id,
        },
      },
      create: {
        userId: user.id,
        clusterId: cluster.id,
        permission: 'admin',
      },
      update: {
        permission: 'admin',
      },
    });

    console.log(`\n✅ Successfully granted admin permission!`);
    console.log(`   User: ${user.email}`);
    console.log(`   Cluster: ${cluster.name}`);
    console.log(`   Permission: ${access.permission}`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

grantClusterAdmin();
