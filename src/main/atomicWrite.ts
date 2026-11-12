import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

/**
 * Replaces a file's contents without ever leaving it half-written.
 *
 * The new contents go to a temporary file next to the target, get flushed to
 * disk, and then the temporary file is renamed over the target. A rename
 * within one folder is atomic, so after a crash the file is either the old
 * version or the new one, never a mix.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  // Same folder as the target: renaming across drives is not atomic.
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    const handle = await open(tempPath, 'w');
    try {
      await handle.writeFile(contents, 'utf8');
      // Without this the rename can reach the disk before the data does.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
