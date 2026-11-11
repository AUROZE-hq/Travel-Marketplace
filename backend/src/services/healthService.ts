import { prisma } from '../config/prisma.js';

export function getHealthStatus() {
  return {
    success: true,
    message: 'Travel Marketplace API is running',
  };
}

export async function checkDatabaseReadiness() {
  await prisma.$queryRaw`SELECT 1`;
  return {
    success: true,
    message: 'Travel Marketplace API and database are ready',
  };
}
