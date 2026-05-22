import { execFileSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';

const HUB_BASE_URL = 'http://api.h5p.org/v1/content-types';
const librariesRoot = resolve(
    process.cwd(),
    'packages/h5p-examples/h5p/libraries'
);
const tempRoot = resolve(process.cwd(), '.tmp/h5p-library-repair');

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

function readMissingAssets() {
    const missingAssets = [];
    const libraryDirs = readdirSync(librariesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    for (const libraryName of libraryDirs) {
        const libraryDir = join(librariesRoot, libraryName);
        const libraryJsonPath = join(libraryDir, 'library.json');

        if (!existsSync(libraryJsonPath)) {
            continue;
        }

        let metadata;
        try {
            metadata = JSON.parse(readFileSync(libraryJsonPath, 'utf8'));
        } catch {
            continue;
        }

        const referencedAssets = [
            ...getPathEntries(metadata.preloadedJs),
            ...getPathEntries(metadata.preloadedCss)
        ];

        for (const assetPath of referencedAssets) {
            const absolutePath = join(libraryDir, assetPath);
            if (!existsSync(absolutePath)) {
                missingAssets.push({ libraryName, assetPath });
            }
        }
    }

    return missingAssets;
}

function machineNameFromLibrary(libraryName) {
    return libraryName.replace(/-\d+\.\d+$/, '');
}

function findFallbackLibraryDir(extractedDir, libraryName) {
    const machineName = machineNameFromLibrary(libraryName);
    const candidates = readdirSync(extractedDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(`${machineName}-`))
        .sort();

    if (candidates.length === 0) {
        return undefined;
    }

    return join(extractedDir, candidates[candidates.length - 1]);
}

async function downloadPackage(machineName, outputFile) {
    const response = await fetch(
        `${HUB_BASE_URL}/${encodeURIComponent(machineName)}`
    );
    if (!response.ok) {
        throw new Error(
            `Failed to download ${machineName}: ${response.status} ${response.statusText}`
        );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(outputFile, bytes);
}

function extractPackage(packageFile, outputDir) {
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });

    if (process.platform === 'win32') {
        const zipAlias = `${packageFile}.zip`;
        cpSync(packageFile, zipAlias, { force: true });
        execFileSync(
            'powershell',
            [
                '-NoProfile',
                '-Command',
                `Expand-Archive -LiteralPath '${zipAlias.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`
            ],
            { stdio: 'inherit' }
        );
        return;
    }

    execFileSync('unzip', ['-oq', packageFile, '-d', outputDir], {
        stdio: 'inherit'
    });
}

function repairFromExtractedPackage(extractedDir, missingAssets) {
    let restored = 0;

    for (const item of missingAssets) {
        let sourceFile = join(extractedDir, item.libraryName, item.assetPath);
        if (!existsSync(sourceFile)) {
            const fallbackDir = findFallbackLibraryDir(
                extractedDir,
                item.libraryName
            );
            if (fallbackDir) {
                sourceFile = join(fallbackDir, item.assetPath);
            }
        }

        if (!existsSync(sourceFile)) {
            continue;
        }

        const targetFile = join(librariesRoot, item.libraryName, item.assetPath);
        mkdirSync(join(targetFile, '..'), { recursive: true });
        cpSync(sourceFile, targetFile, { force: false, errorOnExist: false });
        restored += 1;
    }

    return restored;
}

async function main() {
    if (!existsSync(librariesRoot)) {
        throw new Error(`Libraries folder not found: ${librariesRoot}`);
    }

    rmSync(tempRoot, { recursive: true, force: true });
    mkdirSync(tempRoot, { recursive: true });

    const initialMissing = readMissingAssets();
    if (initialMissing.length === 0) {
        console.log('[h5p-repair] No missing assets found.');
        return;
    }

    console.log(`[h5p-repair] Missing assets before repair: ${initialMissing.length}`);

    const machineNames = Array.from(
        new Set(initialMissing.map((item) => machineNameFromLibrary(item.libraryName)))
    ).sort();

    let restoredTotal = 0;
    for (const machineName of machineNames) {
        const packageFile = join(tempRoot, `${machineName}.h5p`);
        const extractedDir = join(tempRoot, machineName);
        try {
            console.log(`[h5p-repair] Downloading ${machineName}...`);
            await downloadPackage(machineName, packageFile);
            extractPackage(packageFile, extractedDir);
            const restored = repairFromExtractedPackage(extractedDir, initialMissing);
            restoredTotal += restored;
            console.log(`[h5p-repair] Restored ${restored} file(s) from ${machineName}.`);
        } catch (error) {
            console.warn(
                `[h5p-repair] Skipping ${machineName}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    const remaining = readMissingAssets();
    console.log(`[h5p-repair] Total restored files: ${restoredTotal}`);
    console.log(`[h5p-repair] Missing assets after repair: ${remaining.length}`);

    if (remaining.length > 0) {
        console.error('[h5p-repair] Remaining missing assets:');
        for (const item of remaining) {
            console.error(` - ${item.libraryName}: ${item.assetPath}`);
        }
        process.exit(1);
    }

    console.log('[h5p-repair] Repair completed successfully.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});