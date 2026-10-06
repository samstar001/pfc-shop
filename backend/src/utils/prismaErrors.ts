import { Prisma } from "@prisma/client";

// Returns the Prisma error code (e.g. "P2002" unique clash, "P2025" not found), or null for other errors
export function prismaCode(err: unknown): string | null {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
}
