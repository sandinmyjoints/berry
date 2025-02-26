---
category: advanced
path: /advanced/pnpapi
title: "PnP API"
---

## Overview

On top of being a simple install strategy, Plug'n'Play also provides a API that allows you to introspect the dependency tree at runtime.

## Runtime Constants

### `process.versions.pnp`

When operating under PnP environments, this value will be set to a number indicating the version of the PnP standard in use (which is strictly identical to `require('pnpapi').VERSIONS.std`).

This value is a convenient way to check whether you're operating under a Plug'n'Play environment (where you can `require('pnpapi')`) or not:

```js
if (process.versions.pnp) {
  // do something with the PnP API ...
} else {
  // fallback
}
```

### `require('pnpapi')`

When operating under a Plug'n'Play environment, a new builtin module will appear in your tree and will be made available to all your packages (regardless of whether they define it in their dependencies or not): `pnpapi`. It exposes the constants a function described in the rest of this document.

Note that we've reserved the `pnpapi` package name on the npm registry, so there's no risk that anyone will be able to snatch the name for nefarious purposes. We might use it later to provide a polyfill for non-PnP environments (so that you'd be able to use the PnP API regardless of whether the project got installed via PnP or not), but as of now it's still an empty package.

## API Interface

### `VERSIONS`

```ts
export const VERSIONS: {std: number, [key: string]: number};
```

The `VERSIONS` object contains a set of numbers that detail which version of the API is currently exposed. The only version that is guaranteed to be there is `std`, which will refer to the version of this document. Other keys are meant to be used to describe extensions provided by third-party implementors.

### `topLevel`

```ts
export const topLevel: {name: null, reference: null};
```

The `topLevel` object is a simple package locator pointing to the top-level package of the dependency tree. Note that even when using workspaces you'll still only have one single top-level for the entire project.

This object is provided for convenience and doesn't necessarily needs to be used; you may create your own top-level locator by using your own locator literal with both fields set to `null`.

### `getPackageInformation(...)`

```ts
export function getPackageInformation(locator: PackageLocator): PackageInformation;
```

The `getPackageInformation` function returns all the information stored inside the PnP API for a given package. The information currently available in the returned object are:

- `packageLocation`, which contains the location of the package on the disk
- `packageDependencies`, which contains the set of dependencies for the given package

### `findPackageLocator(...)`

```ts
export function findPackageLocator(location: string): PackageLocator | null;
```

Given a location on the disk, the `findPackageLocator` function will return the package that "owns" the path. For example, running this function on something conceptually similar to `/.../node_modules/foo/index.js` would return a package locator pointing to the `foo` package (and its exact version).

Note that it's important that you don't call `realpath` on the path argument. The current Yarn implementation uses symlinks in order to disambiguate packages that list peer dependencies, and calling `realpath` would cause the PnP API to lose track of which virtual package owns the file. This would in turn cause `findPackageLocator` to return potentially boggus results.

### `resolveToUnqualified(...)`

```ts
export function resolveToUnqualified(request: string, issuer: string | null, opts?: {considerBuiltins?: boolean}): string | null;
```

The `resolveToUnqualified` function is maybe the most important function exposed by the PnP API. Given a request (which may be a bare specifier like `lodash`, or an relative/absolute path like `./foo.js`), the PnP API will return the unqualified resolution.

For example, the following:

```
lodash/uniq
```

Might very well be resolved into:

```
/my/cache/lodash/1.0.0/node_modules/lodash/uniq
```

As you can see, the `.js` extension didn't get added. This is due to the difference between [qualified and unqualified resolutions](#qualified-vs-unqualified-resolutions). In case you must obtain a path ready to be used with the filesystem API, prefer using `resolveRequest` instead.

### `resolveUnqualified(...)`

```ts
export function resolveUnqualified(unqualified: string, opts?: {extensions?: Array<string>}): string;
```

The `resolveUnqualified` function is mostly provided as an helper; it reimplements the Node resolution for file extensions and folder indexes, but not the regular `node_modules` traversal. It makes it slightly easier to integrate PnP into some projects, although it isn't required in any way if you already have something that fits the bill.

To give you an example `resolveUnqualified` isn't needed with `enhanced-resolved`, used by Webpack, because it already implements its own way the logic contained in `resolveUnqualified` (and more). Instead, we only have to leverage the lower-level `resolveToUnqualified` function and feed it to the regular resolver.

For example, the following:

```
/my/cache/lodash/1.0.0/node_modules/lodash/uniq
```

Might very well be resolved into:

```
/my/cache/lodash/1.0.0/node_modules/lodash/uniq/index.js
```

### `resolveRequest(...)`

```ts
export function resolveRequest(request: string, issuer: string | null, opts?: {considerBuiltins?: boolean, extensions?: Array<string>}): string | null;
```

The `resolveRequest` function is a wrapper around both `resolveToUnqualified` and `resolveUnqualified`. In essence, it's a bit like calling `resolveUnqualified(resolveToUnqualified(...))`, but shorter.

Just like `resolveUnqualified`, `resolveRequest` is entirely optional and you might want to skip it to directly use the lower-level `resolveToUnqualified` if you already have a resolution pipeline that just needs to add support for Plug'n'Play.

For example, the following:

```
lodash
```

Might very well be resolved into:

```
/my/cache/lodash/1.0.0/node_modules/lodash/uniq/index.js
```

## Qualified vs Unqualified Resolutions

This document detailed two types of resolutions: qualified and unqualified. Although similar, they present different characteristics that make them suitable in different settings.

The difference between qualified and unqualified resolutions lies in the quirks of the Node resolution itself. Unqualified resolutions can be statically computed without ever accessing the filesystem, but only can only resolve relative paths and bare specifiers (like `lodash`); they won't ever resolve the file extensions or folder indexes. By contrast, qualified resolutions are ready to be used to access the filesystem.

Unqualified resolutions are the core of the Plug'n'Play API; they represent data that cannot be obtained any other way. If you're looking to integrate Plug'n'Play inside your resolver, they're likely what you're looking for. On the other hand, fully qualified resolutions are handy if you're working with the PnP API as a one-off and just want to obtain some information on a given file or package.

Two great options for two different use cases 🙂
