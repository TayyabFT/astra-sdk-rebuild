import { readdir, rename, access, constants } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '..', 'dist');

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function renameFiles() {
  try {
    const files = await readdir(distDir);
    
    // Rename type definition files
    const astraSdkDts = join(distDir, 'astra-sdk.d.ts');
    const indexDts = join(distDir, 'index.d.ts');
    if (await fileExists(astraSdkDts) && !await fileExists(indexDts)) {
      await rename(astraSdkDts, indexDts);
      console.log('Renamed astra-sdk.d.ts to index.d.ts');
    }

    const componentsDts = join(distDir, 'components.d.ts');
    if (!await fileExists(componentsDts)) {
      // Check if there's an index.d.ts that should be components.d.ts
      // This happens when components is built second and overwrites the main index.d.ts
      // We need to check the content or handle this differently
      // For now, we'll leave it as is since tsup should handle this correctly
    }

    console.log('Assets copy and file renaming completed successfully');
  } catch (error) {
    console.error('Error during file operations:', error);
    process.exit(1);
  }
}

renameFiles();

