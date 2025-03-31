# TYPO3 Playground and PHP WASM (WebAssembly)

This project is a **fork** of the [WordPress Playground](https://github.com/WordPress/wordpress-playground), adapted to run **TYPO3** entirely in the browser. By compiling PHP to **WebAssembly** with **Emscripten** and using **SQLite** as the default database, TYPO3 Playground offers a fully serverless, browser-based environment. This eliminates the need for external hosting or a local setup, making it ideal for quick demos, QA, or experimenting with TYPO3 extensions. Explore TYPO3 without having to install PHP or manage databases—just open a modern browser and go.

**Live Demo:** [https://typo3-playground-edc132.macopedia.io
](https://typo3-playground-edc132.macopedia.io
)  
**Backend credentials**: admin / password

---

## Why is TYPO3 Playground useful?

TYPO3 Playground aims to make TYPO3 instantly accessible for users, integrators, and extension developers by using a WASM approach proven by WordPress Playground. No local environment or hosting platform is needed—all you need is a modern web browser. 

Key benefits include:

- **Zero setup:** Anyone can load TYPO3 without installing PHP, a database, or external services.
- **Experimental environment:** Great for testing, QA, or quick demos of TYPO3 extensions and features.
- **Security by isolation:** All data lives locally in your browser. Once the tab is closed or reset, the environment is wiped. At the same time, you can save and load your session state.

---

## Features

- **Working PoC of TYPO3 13.4**: Full working backend, with persistable data, working backend modules, page creation, and content editing. The frontend also renders properly.
- **Try out extensions from TER** directly in your browser. This can accelerate QA processes and allow quick testing of new extensions without installing anything locally.
- **Ideal for demos**: Show your product or site to a client in any modern browser.
- **Security**: Everything resides in your local browser storage. Resetting the tab or clearing data returns the environment to its initial state.
- **Content creation and sync**: Create pages in the browser, then  sync the files from your browser to your computer or potentially another environment.
- **Scope saving**: You can save the current scope (session state) of the application and switch between them, your work is saved and can be restored later.

---
## Keynotes for TYPO3 Playground

- Uses **SQLite** instead of MySQL to simplify the database layer in WebAssembly.
- Includes a custom-compiled php-intl extension, necessary for TYPO3’s localization and date formatting.
- Relies on a special “browser scope” appended to URLs, inspired by WordPress Playground’s architecture, to keep each in-browser instance isolated.
- The initial ZIP download may exceed **100 MB** because it contains a full TYPO3 installation (including the Introduction Package). We plan to reduce this or split static assets for faster loading.
- Image processing (for example, via ImageMagick) is not yet supported in WASM; we are exploring ways to handle it by either compiling ImageMagick or offloading to a microservice.
- A CORS proxy is needed to install TYPO3 extensions directly from the TYPO3 Extension Repository (TER), similar to how WordPress Playground fetches plugins.

---

## Running TYPO3 Playground locally

1. **Move into the directory** (assuming you already cloned or downloaded this repository):
```bash
cd typo3-playground
 ```

2. **Install submodules**:
```bash
git submodule update --recursive --init
 ```

3. **Install dependencies**:

```bash
   npm install
```

4. **Start the dev server**:

```bash
   npm run dev
```
   A local server should open a browser tab with your **client-side TYPO3 instance**. Changes to TypeScript files are live-reloaded.


---

## Offline support

TYPO3 Playground can support offline usage once you build the website and serve it locally. Features that require remote resources—such as extension downloads—will not work offline unless cached.

1. **Build the website**:

   PLAYGROUND_URL=http://localhost:9999 npx nx run playground-website:build:wasm-typo3-net

2. **Serve locally**:

   php -S localhost:9999 -t dist/packages/playground/wasm-typo3-net

3. **Test offline**:

	- Open your browser’s developer tools, switch network throttling to "Offline", and refresh the page.

---

## Project structure

We have a stable-running TYPO3 thanks to two core components:

1. **Monorepo application (typo3-playground)** – Contains the adapted Playground code, scripts, and build processes.
2. **TYPO3 repository for bundling** – A separate repo that stores the full TYPO3 codebase to be compressed into a ZIP for browser installation.

Links:
- Link to Playground: https://typo3-playground-edc132.macopedia.io
- TYPO3 ZIP repo: https://github.com/macopedia/typo3-wasm-zip

---

## Known issues

1. **Large initial ZIP download** (approximately 100 MB):
	- Currently includes the Introduction Package to ensure everything works as expected.
	- Possible fixes:
		- Provide a "clean" TYPO3 variant with fewer resources, letting the user install the Introduction Package if needed.
		- Adopt the WordPress Playground approach of splitting static files from the core ZIP so the UI can render more quickly while large assets load in the background.

2. **Frontend performance**:
	- The TYPO3 backend runs smoothly, but the frontend (TSFE) can be slow.
	- A minimal "clean" version might help reduce overhead; the Introduction Package has many extra files.
	- Profiling is possible with xdebug or direct Emscripten tooling, but we have not completed this integration yet.

3. **Image processing**:
	- We have not solved native image manipulation in WASM yet.
	- Possible approaches:
		- Compile ImageMagick to WASM and intercept exec() calls to pass commands to the local WASM Imagemagick convert tool.
		- Use a remote microservice for converting images.
		- Investigate VRZNO with PHP and WASM ImageMagick, but the direct WASM ImageMagick path seems most native.

---

## Future plans

- **Browser-based IDE**: Potentially enable an in-browser VSCode for editing TYPO3 files directly.
- **Commit to any repository**: Let users push changes from the Playground environment.
- **One-click Gerrit reviews**: WordPress Playground has a mechanism for this; we could adapt it for TYPO3 if resources allow.
- **Multiple TYPO3 versions**: For example, v12, v13, or future releases.
- **Blueprints**: Adapt WordPress Playground’s blueprint feature to define complex setups automatically (extensions, site configs, etc.).
- **One-click deployment**: Push a Playground environment to other hosting environments with minimal steps, easily deploy your work.
- - **Switch PHP versions** needs compiling of php-intl PHP WASM extension for each PHP version.

---

## How to contribute

TYPO3 Playground is open-source and welcomes contributors from code, design, documentation, and QA. If a feature is missing, or you find a bug, feel free to open a discussion or an issue on GitHub:

- Code contributions – help us refine the WASM build, and more.
- Documentation – help create or improve our docs.
- Bug reports – open an issue to detail your environment and replication steps.
- Extension ideas – we are excited about enabling more advanced TYPO3 features, including image processing, blueprint setups, etc.

---

## Backwards compatibility and disclaimer

This playground is **experimental**. It may change or break without warning. Our goal is to eventually define a more stable API once the codebase matures. Until then, expect updates or alterations to how embedding, extension installation, or certain modules work.

---

## Prior art and credits

TYPO3 Playground was created as part of a TYPO3 Budget Idea. It is heavily inspired by and adapted from [WordPress Playground](https://github.com/WordPress/wordpress-playground), originally led by [Adam Zieliński](https://github.com/adamziel). WordPress Playground itself built on early PHP-to-WASM projects like [oraoto/pib](https://github.com/oraoto/pib) and [seanmorris/php-wasm](https://github.com/seanmorris/php-wasm).

We extend our thanks to the WordPress Playground team for their foundational work, including packaging scripts, Dockerfiles, scope management, and documentation. We also appreciate the broader open-source community for feedback, bug reports, and contributions.

