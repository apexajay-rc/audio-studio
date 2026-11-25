# Dependency Baseline

Direct dependencies are pinned exactly in `package.json`. The baseline was checked against package registry listings on 25 November 2026.

| Package | Pinned version | Role |
|---|---:|---|
| React / React DOM | 19.3.1 | UI runtime |
| Vite | 8.3.8 | Development server and production bundler |
| `@vitejs/plugin-react` | 6.3.0 | React support in Vite |
| TypeScript | 6.0.3 | Static type checking |
| Vitest | 5.1.1 | Unit testing |
| ESLint | 10.15.0 | Static linting |
| `typescript-eslint` | 8.74.0 | TypeScript lint rules |
| Prettier | 3.10.1 | Formatting |
| React type definitions | 19.3.0 | TypeScript declarations |
| `@breezystack/lamejs` | 1.2.7 | MP3 encoding in a dedicated module worker (LGPL-3.0) |
| Node type definitions | 26.6.6 | Node declarations for tooling |

## Compatibility reasoning

- Node 26 is the current Active LTS line as of this baseline date. The package engine accepts Node `>=22.12.0` so the local Node 22.16 toolchain can also run Vite 8.
- TypeScript 6.0.3 is selected rather than TypeScript 7.0.x because the current `typescript-eslint` supported TypeScript range is `>=4.8.4 <6.1.0`.
- Direct dependency versions are exact, not semver ranges. The resolved transitive graph must be captured in `package-lock.json` on the developer machine before CI is enabled.

## Registry references

- Node release schedule: https://github.com/nodejs/Release
- React: https://www.npmjs.com/package/react
- Vite: https://www.npmjs.com/package/vite
- Vite React plugin: https://www.npmjs.com/package/@vitejs/plugin-react
- TypeScript releases: https://github.com/microsoft/TypeScript/releases
- Vitest: https://www.npmjs.com/package/vitest
- ESLint: https://www.npmjs.com/package/eslint
- typescript-eslint compatibility: https://typescript-eslint.io/users/dependency-versions/
- Prettier: https://www.npmjs.com/package/prettier
- `@breezystack/lamejs`: https://www.npmjs.com/package/@breezystack/lamejs

## Required before CI activation

1. Run `npm install` with registry access.
2. Review and commit `package-lock.json`.
3. Run `npm audit` against the resolved dependency tree.
4. Run lint, type-check, unit tests, and production build.
5. Add CI using `npm ci` only after the lockfile is committed.
