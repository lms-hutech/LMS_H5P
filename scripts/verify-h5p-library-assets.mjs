import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const librariesRoot = join(
    process.cwd(),
    'packages',
    'h5p-examples',
    'h5p',
    'libraries'
);

function getPathEntries(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            }
            if (entry && typeof entry.path === 'string') {
                return entry.path;
            }
            return null;
        })
        .filter((entry) => Boolean(entry));
}

if (!existsSync(librariesRoot)) {
    console.error(`[h5p-integrity] Libraries folder not found: ${librariesRoot}`);
    process.exit(1);
}

const libraryDirs = readdirSync(librariesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const missingAssets = [];
const invalidJsonFiles = [];

for (const libraryName of libraryDirs) {
    const libraryDir = join(librariesRoot, libraryName);
    const libraryJsonPath = join(libraryDir, 'library.json');

    if (!existsSync(libraryJsonPath)) {
        continue;
    }

    let metadata;
    try {
        metadata = JSON.parse(readFileSync(libraryJsonPath, 'utf8'));
    } catch (error) {
        invalidJsonFiles.push({
            libraryName,
            message: error instanceof Error ? error.message : String(error)
        });
        continue;
    }

    const referencedAssets = [
        ...getPathEntries(metadata.preloadedJs),
        ...getPathEntries(metadata.preloadedCss)
    ];

    for (const assetPath of referencedAssets) {
        const absoluteAssetPath = join(libraryDir, assetPath);
        if (!existsSync(absoluteAssetPath)) {
            missingAssets.push({ libraryName, assetPath });
        }
    }
}

if (invalidJsonFiles.length > 0) {
    console.error(
        `[h5p-integrity] Found ${invalidJsonFiles.length} invalid library.json file(s):`
    );
    for (const invalid of invalidJsonFiles) {
        console.error(` - ${invalid.libraryName}: ${invalid.message}`);
    }
}

if (missingAssets.length > 0) {
    console.error(
        `[h5p-integrity] Found ${missingAssets.length} missing preloaded asset(s):`
    );
    for (const item of missingAssets) {
        console.error(` - ${item.libraryName}: ${item.assetPath}`);
    }
    process.exit(1);
}

if (invalidJsonFiles.length > 0) {
    process.exit(1);
}

console.log(
    `[h5p-integrity] OK: verified ${libraryDirs.length} library folder(s), no missing preloaded assets.`
);