# LMS_H5P

`LMS_H5P` is a sanitized public export of an H5P server workspace used for Canvas LMS and LTI 1.3 integration experiments.

It is based on the Lumieducation H5P Node.js monorepo and keeps the example servers, bundled H5P core/editor assets, and workspace structure needed to run and extend the project locally without publishing any private deployment data.

## What This Repository Includes

- the H5P Node.js workspace under [`packages/`](./packages)
- the main example server in [`packages/h5p-examples`](./packages/h5p-examples)
- an additional REST example server/client in [`packages/h5p-rest-example-server`](./packages/h5p-rest-example-server) and [`packages/h5p-rest-example-client`](./packages/h5p-rest-example-client)
- bundled H5P core, editor, and libraries required by the example applications
- setup scripts, docs, and development tooling from the workspace

## What Was Removed From The Public Export

To make this repository safe to publish, the following were intentionally removed or replaced:

- real `.env` files and all live credentials
- local runtime content in `packages/h5p-examples/h5p/content`
- local user progress/state in `packages/h5p-examples/h5p/user-data`
- temporary upload storage in `packages/h5p-examples/h5p/temporary-storage`
- local IDE and indexing folders such as `.claude`, `.gitnexus`, and `.vscode`
- deployment-specific API keys, Google picker credentials, private URLs, and other sensitive values

For deeper notes about the sanitization, see [PUBLIC_SETUP.md](./PUBLIC_SETUP.md).

## Quick Start

### Prerequisites

- Node.js `20+`
- npm `7+`
- MongoDB if you plan to use the LTI or persistent-data flows

### Install And Run

```bash
git clone https://github.com/tienhaydev/LMS_H5P.git
cd LMS_H5P
npm install
cp packages/h5p-examples/.env.example packages/h5p-examples/.env
```

Edit `packages/h5p-examples/.env` with values appropriate for your environment.

Then build and start the example server:

```bash
npm run build:h5p-examples
npm run start --workspace=packages/h5p-examples
```

With the default example configuration, the app listens on `http://localhost:8080`.

## Common Workflows

### Standalone Example Server

```bash
npm run build:h5p-examples
npm run start --workspace=packages/h5p-examples
```

### LTI 1.3 Example Server

```bash
npm run build:h5p-examples
npm run start:lti --workspace=packages/h5p-examples
```

### Build The Full Workspace

```bash
npm run build
```

### Run The Workspace Test Suite

```bash
npm test
```

Note: some advanced flows depend on external services such as MongoDB, Redis, S3-compatible storage, Canvas, or Google APIs. Those integrations require your own local configuration.

## Environment Notes

The most important values in [`packages/h5p-examples/.env.example`](./packages/h5p-examples/.env.example) are:

- `H5P_PUBLIC_URL`: public base URL of the H5P server
- `MONGODB_URI`: MongoDB connection string for LTI and persistent storage flows
- `LTI_KEY`: secret used by the LTI implementation
- `LTI_CLIENT_ID`: Canvas developer key client ID
- `PLATFORM_URL`: Canvas base URL

Optional integrations such as Google Drive Picker, Gemini, Groq, Redis, and S3 are documented as placeholders in the example env file and must be configured with your own values.

## Repository Layout

- [`packages/h5p-server`](./packages/h5p-server): core H5P server library
- [`packages/h5p-express`](./packages/h5p-express): Express integration helpers
- [`packages/h5p-mongos3`](./packages/h5p-mongos3): MongoDB and S3 storage adapters
- [`packages/h5p-examples`](./packages/h5p-examples): main runnable example server for editor/player/LTI flows
- [`packages/h5p-rest-example-server`](./packages/h5p-rest-example-server): REST-based example server
- [`docs`](./docs): upstream and workspace documentation
- [`scripts`](./scripts): helper scripts and local service setup

## Security Notes

- Do not commit your local `.env` file.
- Do not re-add runtime content, user data, or temporary storage unless you intend to publish sample data.
- The Google Drive picker pages in this repository contain placeholders, not working production credentials.
- If you wire this project to Canvas or another LMS, treat all platform keys and tokens as secrets and keep them out of version control.

## Upstream Context

This repository is a public-safe workspace derived from the Lumieducation H5P Node.js ecosystem. If you are looking for the original upstream monorepo history and package sources, see:

- `https://github.com/Lumieducation/H5P-Nodejs-library`

## License

This repository is distributed under the terms of the GNU General Public License v3.0 or later. See [`LICENSE`](./LICENSE).

Bundled third-party components and embedded assets may carry their own license notices in subdirectories such as `packages/**/LICENSE*`, `README*`, or vendor asset folders. Those notices remain authoritative for the relevant components.
