# Public Setup Notes

This repository is a sanitized public export of the local H5P server workspace.

What was intentionally removed:
- real `.env` files and local credentials
- `node_modules`
- local runtime content in `packages/h5p-examples/h5p/content`
- local user data in `packages/h5p-examples/h5p/user-data`
- temporary upload storage in `packages/h5p-examples/h5p/temporary-storage`
- local tooling folders such as `.claude`, `.gitnexus`, and `.vscode`

Basic setup:
1. Install Node.js 20+ and npm 7+.
2. Run `npm install` in the repository root.
3. Copy `packages/h5p-examples/.env.example` to `packages/h5p-examples/.env`.
4. Fill in the required values for `H5P_PUBLIC_URL`, `MONGODB_URI`, `LTI_KEY`, `LTI_CLIENT_ID`, and `PLATFORM_URL`.
5. Add optional values such as `CANVAS_ISSUER`, `CANVAS_API_TOKEN`, `GEMINI_API_KEY`, and `GROQ_API_KEY` only if you use those features.
6. Start the example server with `npm run start --workspace=packages/h5p-examples`.

Google Drive Picker:
- `packages/h5p-examples/public/h5p-icons/gdrive-picker.html` now contains placeholders instead of live Google credentials.
- Replace the placeholder values with your own Google API key, OAuth client ID, and app ID before using that page.

Notes:
- The repository still includes the H5P core, editor, and libraries needed by the example server.
- Runtime content and user data are expected to be generated locally after setup.
