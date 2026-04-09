/**
 * Shared Canvas LMS utility functions.
 */

/**
 * Resolve Canvas numeric course ID from LTI token custom params,
 * falling back to Canvas API search by course title.
 */
export async function resolveCanvasCourseId(
    token: any,
    fallbackCourseId?: string
): Promise<string> {
    const customParams = token?.platformContext?.custom || {};
    const fromCustom =
        customParams.canvas_course_id ||
        customParams['$Canvas.course.id'] ||
        '';
    if (fromCustom) {
        return String(fromCustom);
    }

    console.warn(
        'canvas_course_id not in LTI custom params — using API fallback. ' +
            'Configure custom_fields in Canvas Developer Key: ' +
            'canvas_course_id=$Canvas.course.id'
    );

    const canvasToken = process.env.CANVAS_API_TOKEN;
    const canvasUrl = process.env.PLATFORM_URL;
    if (!canvasToken || !canvasUrl) {
        return fallbackCourseId || '';
    }

    const contextTitle = token?.platformContext?.context?.title;
    if (!contextTitle) {
        return fallbackCourseId || '';
    }

    try {
        const resp = await fetch(
            `${canvasUrl}/api/v1/courses?search_term=${encodeURIComponent(contextTitle)}&per_page=10`,
            { headers: { Authorization: `Bearer ${canvasToken}` } }
        );
        if (resp.ok) {
            const courses = await resp.json();
            const match = courses.find((c: any) => c.name === contextTitle);
            if (match) {
                return String(match.id);
            }
        }
    } catch (_e) {
        console.warn(
            'Canvas course ID API fallback failed:',
            (_e as Error).message
        );
    }

    return fallbackCourseId || '';
}
