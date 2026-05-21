import express from 'express';

import * as H5P from '@lumieducation/h5p-server';
import {
    IRequestWithUser,
    IRequestWithLanguage
} from '@lumieducation/h5p-express';

/**
 * @param h5pEditor
 * @param h5pPlayer
 * @param languageOverride the language to use. Set it to 'auto' to use the
 * language set by a language detector in the req.language property.
 * (recommended)
 */
export default function (
    h5pEditor: H5P.H5PEditor,
    h5pPlayer: H5P.H5PPlayer,
    languageOverride: string | 'auto' = 'auto'
): express.Router {
    const router = express.Router();

    router.get(
        `${h5pEditor.config.playUrl}/:contentId`,
        async (req: IRequestWithUser, res) => {
            try {
                const h5pPage = await h5pPlayer.render(
                    req.params.contentId as string,
                    req.user,
                    languageOverride === 'auto'
                        ? (req.language ?? 'en')
                        : languageOverride,
                    {
                        showCopyButton: true,
                        showDownloadButton: true,
                        showFrame: true,
                        showH5PIcon: true,
                        showLicenseButton: true,
                        // We pass through the contextId here to illustrate how
                        // to work with it. Context ids allow you to have
                        // multiple user states per content object. They are
                        // purely optional. You should *NOT* pass the contextId
                        // to the render method if you don't need contextIds!
                        // You can test the contextId by opening
                        // `/h5p/play/XXXX?contextId=YYY` in the browser.
                        contextId:
                            typeof req.query.contextId === 'string'
                                ? req.query.contextId
                                : undefined,
                        // You can impersonate other users to view their content
                        // state by setting the query parameter asUserId.
                        // Example:
                        // `/h5p/play/XXXX?asUserId=YYY`
                        asUserId:
                            typeof req.query.asUserId === 'string'
                                ? req.query.asUserId
                                : undefined,
                        // You can disabling saving of the user state, but still
                        // display it by setting the query parameter
                        // `readOnlyState` to `yes`. This is useful if you want
                        // to review other users' states by setting `asUserId`
                        // and don't want to change their state.
                        // Example:
                        // `/h5p/play/XXXX?readOnlyState=yes`
                        readOnlyState:
                            typeof req.query.readOnlyState === 'string'
                                ? req.query.readOnlyState === 'yes'
                                : undefined
                    }
                );
                res.send(h5pPage);
                res.status(200).end();
            } catch (error) {
                res.status(500).end(error.message);
            }
        }
    );

    router.get(
        '/edit/:contentId',
        async (req: IRequestWithLanguage & IRequestWithUser, res) => {
            let page = await h5pEditor.render(
                req.params.contentId as string,
                languageOverride === 'auto'
                    ? (req.language ?? 'en')
                    : languageOverride,
                req.user
            );
            // Fix cross-origin iframe: parent.H5PIntegration throws SecurityError
            page = page.replace(
                'window.H5PIntegration = parent.H5PIntegration ||',
                'window.H5PIntegration = (function(){try{return parent.H5PIntegration}catch(e){return null}})()||'
            );
            // Shim H5PEditor before vi.js tries to set H5PEditor.language.core
            page = page.replace(
                '<head>',
                '<head><script>window.H5PEditor=window.H5PEditor||{};H5PEditor.language=H5PEditor.language||{};H5PEditor.language.core=H5PEditor.language.core||{};</script>'
            );
            // Inject "Quay lại" button after <body>
            page = page.replace(
                '<body>',
                `<body><div style="padding:8px 16px;background:#f8f9fa;border-bottom:1px solid #dee2e6;font-family:Arial,sans-serif"><button onclick="history.back()" style="padding:8px 16px;border-radius:4px;border:none;cursor:pointer;font-size:14px;color:white;background:#666">&#9664; Quay l\u1ea1i</button></div>`
            );
            // After save, reload parent (Canvas) or go back
            page = page.replace(
                /window\.location\.href\s*=\s*['"][^'"]*\/play\/['"].*?;/s,
                `try { window.parent.location.reload(); } catch(e) { history.back(); }`
            );
            // Cache bust editor scripts to force browser reload patched version
            page = page.replace(
                /h5peditor\.js\?version=([^"']+)/g,
                'h5peditor.js?version=$1.fix3'
            );
            page = page.replace(
                /h5peditor-([^.]+)\.js\?version=([^"']+)/g,
                'h5peditor-$1.js?version=$2.fix3'
            );
            // Vietnamese button label
            page = page.replace('value="Create"', 'value="L\u01b0u"');
            res.send(page);
            res.status(200).end();
        }
    );

    router.post('/edit/:contentId', async (req: IRequestWithUser, res) => {
        const rawParams = req.body?.params;
        const bodyParams =
            typeof rawParams === 'string'
                ? (() => {
                      try {
                          return JSON.parse(rawParams);
                      } catch {
                          return null;
                      }
                  })()
                : rawParams;
        if (
            !req.body ||
            !bodyParams ||
            !bodyParams.params ||
            !bodyParams.metadata ||
            !req.body.library ||
            !req.user
        ) {
            res.status(400).send('Malformed request').end();
            return;
        }
        try {
            const contentId = await h5pEditor.saveOrUpdateContent(
                req.params.contentId.toString(),
                bodyParams.params,
                bodyParams.metadata,
                req.body.library,
                req.user
            );
            res.send(JSON.stringify({ contentId }));
            res.status(200).end();
        } catch (error: any) {
            console.error('Error saving content:', error);
            res.status(500)
                .json({ error: error.message || 'Internal server error' })
                .end();
        }
    });

    router.get(
        '/new',
        async (req: IRequestWithLanguage & IRequestWithUser, res) => {
            const overwriteId = (req as any).query?.overwriteId;
            let page = await h5pEditor.render(
                undefined,
                languageOverride === 'auto'
                    ? (req.language ?? 'en')
                    : languageOverride,
                req.user
            );
            // Fix cross-origin iframe: parent.H5PIntegration throws SecurityError
            page = page.replace(
                'window.H5PIntegration = parent.H5PIntegration ||',
                'window.H5PIntegration = (function(){try{return parent.H5PIntegration}catch(e){return null}})()||'
            );
            // Shim H5PEditor before vi.js tries to set H5PEditor.language.core
            page = page.replace(
                '<head>',
                '<head><script>window.H5PEditor=window.H5PEditor||{};H5PEditor.language=H5PEditor.language||{};H5PEditor.language.core=H5PEditor.language.core||{};</script>'
            );
            // Inject "Quay lại" button after <body>
            page = page.replace(
                '<body>',
                `<body><div style="padding:8px 16px;background:#f8f9fa;border-bottom:1px solid #dee2e6;font-family:Arial,sans-serif"><button onclick="history.back()" style="padding:8px 16px;border-radius:4px;border:none;cursor:pointer;font-size:14px;color:white;background:#666">&#9664; Quay l\u1ea1i</button></div>`
            );
            if (overwriteId) {
                // "Tạo lại" flow: POST to /h5p/edit/:overwriteId to overwrite existing content
                page = page.replace(
                    "type: 'POST'",
                    `type: 'POST',\n                          url: '/h5p/edit/${overwriteId}'`
                );
                // After save: go back to player (same contentId, new content)
                page = page.replace(
                    /window\.location\.href\s*=\s*['"][^'"]*\/play\/['"].*?;/s,
                    `history.back();`
                );
            } else if ((req as any).query?.quizBank === '1') {
                // Quiz bank mode: postMessage to parent dashboard instead of navigating
                page = page.replace(
                    /window\.location\.href\s*=\s*['"][^'"]*\/play\/['"].*?;/s,
                    `window.parent.postMessage({ type: 'h5p-content-saved', contentId: parsedResult.contentId }, window.location.origin);`
                );
                // Hide the "Quay lại" button in quiz bank mode
                page = page.replace('&#9664; Quay l\u1EA1i', '&#9664; Hủy');
                // Auto-select content type: skip Hub by auto-clicking
                const libraryParam = (req as any).query?.library || '';
                if (libraryParam) {
                    const autoSelectScript =
                        `
<sc` +
                        `ript>
(function() {
    var lib = ${JSON.stringify(libraryParam)};
    var searchMap = {
        'H5P.MultiChoice': 'Trắc nghiệm nhiều lựa chọn',
        'H5P.TrueFalse': 'Đúng sai',
        'H5P.Blanks': 'Điền vào chỗ trống',
        'H5P.DragQuestion': 'Kéo và thả',
        'H5P.DragText': 'Kéo thả từ',
        'H5P.MarkTheWords': 'Đánh dấu từ',
        'H5P.SingleChoiceSet': 'Chọn câu trả lời đúng',
        'H5P.MultiMediaChoice': 'Trắc nghiệm tính cách'
    };
    var term = searchMap[lib];
    if (!term) return;

    function getHubDoc() {
        // Hub may be inside editor iframe or directly in the page
        var frame = document.querySelector('iframe.h5p-editor-iframe');
        if (frame) {
            try { return frame.contentDocument; } catch(e) { return null; }
        }
        return document;
    }

    var tries = 0;
    var iv = setInterval(function() {
        tries++;
        if (tries > 50) { clearInterval(iv); return; }
        var hubDoc = getHubDoc();
        if (!hubDoc) return;
        var input = hubDoc.querySelector('input.h5p-hub-search-bar');
        if (!input) return;
        clearInterval(iv);
        // Set search value via native setter to trigger React/Preact
        var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, term);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // Results will appear — teacher picks the specific type manually
    }, 300);
})();
</sc` +
                        `ript>`;
                    page = page.replace(
                        '</body>',
                        autoSelectScript + '</body>'
                    );
                }
            } else {
                // Normal new: navigate to play the new content
                page = page.replace(
                    /window\.location\.href\s*=\s*['"][^'"]*\/play\/['"].*?;/s,
                    `window.location.href = '/h5p/play/' + parsedResult.contentId;`
                );
            }
            // Cache bust editor scripts to force browser reload patched version
            page = page.replace(
                /h5peditor\.js\?version=([^"']+)/g,
                'h5peditor.js?version=$1.fix3'
            );
            page = page.replace(
                /h5peditor-([^.]+)\.js\?version=([^"']+)/g,
                'h5peditor-$1.js?version=$2.fix3'
            );
            // Vietnamese button label
            page = page.replace('value="Create"', 'value="L\u01b0u"');
            res.send(page);
            res.status(200).end();
        }
    );

    router.post('/new', async (req: IRequestWithUser, res) => {
        const rawParams = req.body?.params;
        const bodyParams =
            typeof rawParams === 'string'
                ? (() => {
                      try {
                          return JSON.parse(rawParams);
                      } catch {
                          return null;
                      }
                  })()
                : rawParams;
        if (
            !req.body ||
            !bodyParams ||
            !bodyParams.params ||
            !bodyParams.metadata ||
            !req.body.library ||
            !req.user
        ) {
            res.status(400).send('Malformed request').end();
            return;
        }
        try {
            const contentId = await h5pEditor.saveOrUpdateContent(
                undefined,
                bodyParams.params,
                bodyParams.metadata,
                req.body.library,
                req.user
            );
            res.send(JSON.stringify({ contentId }));
            res.status(200).end();
        } catch (error: any) {
            console.error('Error saving new content:', error);
            res.status(500)
                .json({ error: error.message || 'Internal server error' })
                .end();
        }
    });

    router.get('/delete/:contentId', async (req: IRequestWithUser, res) => {
        try {
            await h5pEditor.deleteContent(
                req.params.contentId as string,
                req.user
            );
        } catch (error) {
            res.send(
                `Error deleting content: ${error.message}<br/><a href="javascript:window.location=document.referrer">Go Back</a>`
            );
            res.status(500).end();
            return;
        }

        res.send(
            `Content successfully deleted.<br/><a href="javascript:window.location=document.referrer">Go Back</a>`
        );
        res.status(200).end();
    });

    return router;
}
