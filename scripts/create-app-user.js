/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Script to create an application user.
 * Usage:
 *   node scripts/create-app-user.js --email user@example.com --name "First User" --password "strong-password" --role admin
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { process } = globalThis;

const prisma = new PrismaClient();
const VALID_ROLES = new Set(['admin', 'developer', 'viewer']);

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function printUsage() {
  console.log('Usage: node scripts/create-app-user.js --email user@example.com --name "First User" --password "strong-password" --role admin');
  console.log('Roles: admin | developer | viewer');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const name = args.name;
  const password = args.password;
  const role = args.role ?? 'viewer';

  if (!email || !name || !password) {
    console.log('❌ Missing required arguments.');
    printUsage();
    process.exit(1);
  }

  if (!VALID_ROLES.has(role)) {
    console.log(`❌ Invalid role: ${role}`);
    printUsage();
    process.exit(1);
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (existingUser) {
      console.log(`❌ User already exists: ${existingUser.email} (${existingUser.role})`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log('✅ User created successfully');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Sign in with the new account.');
    console.log('  2. Add cluster access in the Security page if needed.');
  } catch (error) {
    console.error('❌ Error creating user:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
