// Deletes a build folder before rebuilding it, so files from code that was
// renamed or removed do not linger in the packaged app.
import { rmSync } from 'node:fs';

for (const dir of process.argv.slice(2)) rmSync(dir, { recursive: true, force: true });
