/**
 * Recursively scan H5P content params and rewrite file paths
 * with a namespace prefix to avoid collisions when composing
 * multiple questions into a single QuestionSet.
 *
 * H5P stores file references in two forms:
 * 1. Object: { path: "images/foo.png", mime: "image/png", ... }
 * 2. Inline HTML: <img src="images/foo.png"> or <source src="...">
 */

const FILE_PATH_REGEX = /^(images|audios|videos)\//;
const HTML_SRC_REGEX =
    /((?:src|poster)=["'])((?:images|audios|videos)\/[^"']+)(["'])/g;

/**
 * Deep-clone and rewrite all file paths in H5P content params.
 * Prefixes file paths with `q{index}/` so that files from different
 * questions don't collide when merged into one QuestionSet content directory.
 *
 * @param params - The H5P content.json params (will be deep-cloned, not mutated)
 * @param prefix - Namespace prefix, e.g. "q0/"
 * @returns Deep-cloned params with rewritten paths
 */
export function rewriteFilePaths(params: any, prefix: string): any {
    if (params === null || params === undefined) return params;

    if (typeof params === 'string') {
        // Rewrite inline HTML src attributes
        return params.replace(
            HTML_SRC_REGEX,
            (_match: string, before: string, path: string, after: string) =>
                `${before}${prefix}${path}${after}`
        );
    }

    if (Array.isArray(params)) {
        return params.map((item) => rewriteFilePaths(item, prefix));
    }

    if (typeof params === 'object') {
        const result: any = {};
        for (const key of Object.keys(params)) {
            if (
                key === 'path' &&
                typeof params[key] === 'string' &&
                FILE_PATH_REGEX.test(params[key])
            ) {
                // Direct file reference object: { path: "images/x.png" }
                result[key] = `${prefix}${params[key]}`;
            } else {
                result[key] = rewriteFilePaths(params[key], prefix);
            }
        }
        return result;
    }

    return params;
}

/**
 * Extract all file paths from H5P content params.
 * Used to know which files to copy when composing a QuestionSet.
 */
export function extractFilePaths(params: any): string[] {
    const paths: string[] = [];

    function walk(obj: any): void {
        if (obj === null || obj === undefined) return;

        if (typeof obj === 'string') {
            // Check inline HTML for file references
            let match: RegExpExecArray | null;
            const regex = new RegExp(HTML_SRC_REGEX.source, 'g');
            while ((match = regex.exec(obj)) !== null) {
                paths.push(match[2]);
            }
            return;
        }

        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }

        if (typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                if (
                    key === 'path' &&
                    typeof obj[key] === 'string' &&
                    FILE_PATH_REGEX.test(obj[key])
                ) {
                    paths.push(obj[key]);
                }
                walk(obj[key]);
            }
        }
    }

    walk(params);
    return [...new Set(paths)]; // deduplicate
}
