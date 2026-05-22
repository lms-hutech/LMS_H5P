const axios = require('axios');
const { accessSync, createWriteStream } = require('fs');
const { readFile, access, mkdir } = require('fs/promises');
const path = require('path');

/**
 * Downloads H5P packages from the H5P Hub for testing purposes.
 * @param contentTypeCacheFilePath Path to the JSON file in the test directory containing the content types to download (should be a copy of the one obtained by the ContentTypeCache from the Hub)
 * @param directoryPath Path to a directory on the disk to save the downloaded H5P to.
 */
const downloadH5pPackages = async (contentTypeCacheFilePath, directoryPath) => {
    const machineNames = (
        await JSON.parse(await readFile(contentTypeCacheFilePath, 'utf-8'))
    ).contentTypes.map((ct) => ct.id);

    console.log(`Found ${machineNames.length} packages.`);

    // Create the directory if it doesn't exist
    try {
        await access(directoryPath);
    }
    catch {
        await mkdir(directoryPath, { recursive: true });
    }

    // Counts how many downloads have been finished
    let downloadsFinished = 0;

    /**
     * Downloads a single H5P package with retry support.
     * Returns the filename on success, null if all attempts fail.
     */
    const downloadOne = async (contentType, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.default.get(
                    `http://api.h5p.org/v1/content-types/${contentType}`,
                    { responseType: 'stream' }
                );
                await new Promise((resolve, reject) => {
                    const filePath = path.join(
                        directoryPath,
                        `${contentType}.h5p`
                    );
                    const file = createWriteStream(filePath);
                    file.on('error', reject);
                    response.data.on('error', (err) => {
                        file.destroy();
                        reject(err);
                    });
                    file.on('finish', resolve);
                    response.data.pipe(file);
                });
                downloadsFinished += 1;
                console.log(
                    `Downloaded example ${downloadsFinished}/${machineNames.length}: ${contentType}.h5p`
                );
                return `${contentType}.h5p`;
            } catch (error) {
                const status = error.response
                    ? `${error.response.status} ${error.response.statusText}`
                    : error.message;
                if (attempt < maxRetries) {
                    console.warn(
                        `Attempt ${attempt}/${maxRetries} failed for ${contentType}: ${status}. Retrying in ${attempt * 2}s...`
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, attempt * 2000)
                    );
                } else {
                    downloadsFinished += 1;
                    console.warn(
                        `${downloadsFinished}/${machineNames.length} Warning: could not download ${contentType} after ${maxRetries} attempts: ${status} (skipping)`
                    );
                    return null;
                }
            }
        }
    };

    // Promise.all allows parallel downloads
    return await Promise.all(
        machineNames
            .filter((machineName) => machineName !== 'H5P.IFrameEmbed') // IFrameEmbed is broken and is deprecated
            .filter((machineName) => {
                try {
                    accessSync(
                        path.join(directoryPath, `${machineName}.h5p`)
                    );
                } catch {
                    return true;
                }
                downloadsFinished += 1;
                console.log(
                    `${downloadsFinished}/${machineNames.length} ${machineName}.h5p has already been downloaded. Skipping!`
                );
                return false;
            })
            .map((contentType) => downloadOne(contentType))
    );
};

const contentTypeCacheFile = path.resolve(process.argv[2]);
const directory = path.resolve(process.argv[3]);

console.log('Downloading content type examples from H5P Hub.');
console.log(`Using content types from ${contentTypeCacheFile}`);
console.log(`Downloading to ${directory}`);

downloadH5pPackages(contentTypeCacheFile, directory)
    .then((results) => {
        const downloaded = results.filter(Boolean).length;
        const skipped = results.length - downloaded;
        console.log(
            `Download finished! Downloaded ${downloaded} files, skipped ${skipped} due to errors.`
        );
    })
    .catch((error) => {
        console.error(`Unexpected error during download: ${error}`);
        process.exit(1);
    });
