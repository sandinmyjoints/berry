import {ReadStream, Stats, WriteStream}          from 'fs';

import {Path, PortablePath, PathUtils, Filename} from './path';
import {convertPath, ppath}                      from './path';


export type CreateReadStreamOptions = Partial<{
  encoding: string,
  fd: number,
}>;

export type CreateWriteStreamOptions = Partial<{
  encoding: string,
  fd: number,
  flags: 'a',
}>;

export type WriteFileOptions = Partial<{
  encoding: string,
  mode: number,
  flag: string,
}> | string;

export abstract class FakeFS<P extends Path> {
  public readonly pathUtils: PathUtils<P>;

  protected constructor(pathUtils: PathUtils<P>) {
    this.pathUtils =  pathUtils;
  }

  abstract getRealPath(): P;

  abstract resolve(p: P): P;

  abstract openPromise(p: P, flags: string, mode?: number): Promise<number>;
  abstract openSync(p: P, flags: string, mode?: number): number;

  abstract closePromise(fd: number): void;
  abstract closeSync(fd: number): void;

  abstract createWriteStream(p: P | null, opts?: CreateWriteStreamOptions): WriteStream;
  abstract createReadStream(p: P | null, opts?: CreateReadStreamOptions): ReadStream;

  abstract realpathPromise(p: P): Promise<P>;
  abstract realpathSync(p: P): P;

  abstract readdirPromise(p: P): Promise<Array<Filename>>;
  abstract readdirSync(p: P): Array<Filename>;

  abstract existsPromise(p: P): Promise<boolean>;
  abstract existsSync(p: P): boolean;

  abstract accessPromise(p: P, mode?: number): Promise<void>;
  abstract accessSync(p: P, mode?: number): void;

  abstract statPromise(p: P): Promise<Stats>;
  abstract statSync(p: P): Stats;

  abstract lstatPromise(p: P): Promise<Stats>;
  abstract lstatSync(p: P): Stats;

  abstract chmodPromise(p: P, mask: number): Promise<void>;
  abstract chmodSync(p: P, mask: number): void;

  abstract mkdirPromise(p: P): Promise<void>;
  abstract mkdirSync(p: P): void;

  abstract rmdirPromise(p: P): Promise<void>;
  abstract rmdirSync(p: P): void;

  abstract symlinkPromise(target: P, p: P): Promise<void>;
  abstract symlinkSync(target: P, p: P): void;

  abstract renamePromise(oldP: P, newP: P): Promise<void>;
  abstract renameSync(oldP: P, newP: P): void;

  abstract copyFilePromise(sourceP: P, destP: P, flags?: number): Promise<void>;
  abstract copyFileSync(sourceP: P, destP: P, flags?: number): void;

  abstract writeFilePromise(p: P, content: string | Buffer | ArrayBuffer | DataView, opts?: WriteFileOptions): void;
  abstract writeFileSync(p: P, content: string | Buffer | ArrayBuffer | DataView, opts?: WriteFileOptions): void;

  abstract unlinkPromise(p: P): Promise<void>;
  abstract unlinkSync(p: P): void;

  abstract utimesPromise(p: P, atime: Date | string | number, mtime: Date | string | number): Promise<void>;
  abstract utimesSync(p: P, atime: Date | string | number, mtime: Date | string | number): void;

  abstract readFilePromise(p: P, encoding: 'utf8'): Promise<string>;
  abstract readFilePromise(p: P, encoding?: string): Promise<Buffer>;

  abstract readFileSync(p: P, encoding: 'utf8'): string;
  abstract readFileSync(p: P, encoding?: string): Buffer;

  abstract readlinkPromise(p: P): Promise<P>;
  abstract readlinkSync(p: P): P;

  async removePromise(p: P) {
    let stat;
    try {
      stat = await this.lstatPromise(p);
    } catch (error) {
      if (error.code === `ENOENT`) {
        return;
      } else {
        throw error;
      }
    }

    if (stat.isDirectory()) {
      for (const entry of await this.readdirPromise(p))
        await this.removePromise(this.pathUtils.resolve(p, entry));

      // 5 gives 1s worth of retries at worst
      for (let t = 0; t < 5; ++t) {
        try {
          await this.rmdirPromise(p);
          break;
        } catch (error) {
          if (error.code === `EBUSY` || error.code === `ENOTEMPTY`) {
            await new Promise(resolve => setTimeout(resolve, t * 100));
            continue;
          } else {
            throw error;
          }
        }
      }
    } else {
      await this.unlinkPromise(p);
    }
  }

  removeSync(p: P) {
    let stat;
    try {
      stat = this.lstatSync(p);
    } catch (error) {
      if (error.code === `ENOENT`) {
        return;
      } else {
        throw error;
      }
    }

    if (stat.isDirectory()) {
      for (const entry of this.readdirSync(p))
        this.removeSync(this.pathUtils.resolve(p, entry));

      this.rmdirSync(p);
    } else {
      this.unlinkSync(p);
    }
  }

  async mkdirpPromise(p: P, {chmod, utimes}: {chmod?: number, utimes?: [Date | string | number, Date | string | number]} = {}) {
    p = this.resolve(p);
    if (p === this.pathUtils.dirname(p))
      return;

    const parts = p.split(this.pathUtils.sep);

    for (let u = 2; u <= parts.length; ++u) {
      const subPath = parts.slice(0, u).join(this.pathUtils.sep) as P;

      if (!this.existsSync(subPath)) {
        try {
          await this.mkdirPromise(subPath);
        } catch (error) {
          if (error.code === `EEXIST`) {
            continue;
          } else {
            throw error;
          }
        }

        if (chmod != null)
          await this.chmodPromise(subPath, chmod);

        if (utimes != null) {
          await this.utimesPromise(subPath, utimes[0], utimes[1]);
        }
      }
    }
  }

  mkdirpSync(p: P, {chmod, utimes}: {chmod?: number, utimes?: [Date | string | number, Date | string | number]} = {}) {
    p = this.resolve(p);
    if (p === this.pathUtils.dirname(p))
      return;

    const parts = p.split(this.pathUtils.sep);

    for (let u = 2; u <= parts.length; ++u) {
      const subPath = parts.slice(0, u).join(this.pathUtils.sep) as P;

      if (!this.existsSync(subPath)) {
        try {
          this.mkdirSync(subPath);
        } catch (error) {
          if (error.code === `EEXIST`) {
            continue;
          } else {
            throw error;
          }
        }

        if (chmod != null)
          this.chmodSync(subPath, chmod);

        if (utimes != null) {
          this.utimesSync(subPath, utimes[0], utimes[1]);
        }
      }
    }
  }

  copyPromise(destination: P, source: P, options?: {baseFs?: undefined, overwrite?: boolean}): Promise<void>;
  copyPromise<P2 extends Path>(destination: P, source: P2, options: {baseFs: FakeFS<P2>, overwrite?: boolean}): Promise<void>;
  async copyPromise<P2 extends Path>(destination: P, source: P2, {baseFs = this as any, overwrite = true}: {baseFs?: FakeFS<P2>, overwrite?: boolean} = {}) {
    const stat = await baseFs.lstatPromise(source);
    const exists = await this.existsSync(destination);

    if (stat.isDirectory()) {
      await this.mkdirpPromise(destination);
      const directoryListing = await baseFs.readdirPromise(source);
      await Promise.all(directoryListing.map(entry => {
        return this.copyPromise(this.pathUtils.join(destination, entry), baseFs.pathUtils.join(source, entry), {baseFs, overwrite});
      }));
    } else if (stat.isFile()) {
      if (!exists || overwrite) {
        if (exists)
          await this.removePromise(destination);

        const content = await baseFs.readFilePromise(source);
        await this.writeFilePromise(destination, content);
      }
    } else if (stat.isSymbolicLink()) {
      if (!exists || overwrite) {
        if (exists)
          await this.removePromise(destination);

        const target = await baseFs.readlinkPromise(source);
        await this.symlinkPromise(convertPath(this.pathUtils, target), destination);
      }
    } else {
      throw new Error(`Unsupported file type (file: ${source}, mode: 0o${stat.mode.toString(8).padStart(6, `0`)})`);
    }

    const mode = stat.mode & 0o777;
    await this.chmodPromise(destination, mode);
  }

  copySync(destination: P, source: P, options?: {baseFs?: undefined, overwrite?: boolean}): void;
  copySync<P2 extends Path>(destination: P, source: P2, options: {baseFs: FakeFS<P2>, overwrite?: boolean}): void;
  copySync<P2 extends Path>(destination: P, source: P2, {baseFs = this as any, overwrite = true}: {baseFs?: FakeFS<P2>, overwrite?: boolean} = {}) {
    const stat = baseFs.lstatSync(source);
    const exists = this.existsSync(destination);

    if (stat.isDirectory()) {
      this.mkdirpSync(destination);
      const directoryListing = baseFs.readdirSync(source);
      for (const entry of directoryListing) {
        this.copySync(this.pathUtils.join(destination, entry), baseFs.pathUtils.join(source, entry), {baseFs, overwrite});
      }
    } else if (stat.isFile()) {
      if (!exists || overwrite) {
        if (exists)
          this.removeSync(destination);

        const content = baseFs.readFileSync(source);
        this.writeFileSync(destination, content);
      }
    } else if (stat.isSymbolicLink()) {
      if (!exists || overwrite) {
        if (exists)
          this.removeSync(destination);

        const target = baseFs.readlinkSync(source);
        this.symlinkSync(convertPath(this.pathUtils, target), destination);
      }
    } else {
      throw new Error(`Unsupported file type (file: ${source}, mode: 0o${stat.mode.toString(8).padStart(6, `0`)})`);
    }

    const mode = stat.mode & 0o777;
    this.chmodSync(destination, mode);
  }

  async changeFilePromise(p: P, content: string) {
    try {
      const current = await this.readFilePromise(p, `utf8`);
      if (current === content) {
        return;
      }
    } catch (error) {
      // ignore errors, no big deal
    }

    await this.writeFilePromise(p, content);
  }

  changeFileSync(p: P, content: string) {
    try {
      const current = this.readFileSync(p, `utf8`);
      if (current === content) {
        return;
      }
    } catch (error) {
      // ignore errors, no big deal
    }

    this.writeFileSync(p, content);
  }

  async movePromise(fromP: P, toP: P) {
    try {
      await this.renamePromise(fromP, toP);
    } catch (error) {
      if (error.code === `EXDEV`) {
        await this.copyPromise(toP, fromP);
        await this.removePromise(fromP);
      } else {
        throw error;
      }
    }
  }

  moveSync(fromP: P, toP: P) {
    try {
      this.renameSync(fromP, toP);
    } catch (error) {
      if (error.code === `EXDEV`) {
        this.copySync(toP, fromP);
        this.removeSync(fromP);
      } else {
        throw error;
      }
    }
  }

  async lockPromise<T>(affectedPath: P, callback: () => Promise<T>): Promise<T> {
    const lockPath = `${affectedPath}.lock` as P;

    const interval = 1000 / 60;
    const timeout = Date.now() + 60 * 1000;

    let fd = null;

    while (fd === null) {
      try {
        fd = await this.openPromise(lockPath, `wx`);
      } catch (error) {
        if (error.code === `EEXIST`) {
          if (Date.now() < timeout) {
            await new Promise(resolve => setTimeout(resolve, interval));
          } else {
            throw new Error(`Couldn't acquire a lock in a reasonable time (via ${lockPath})`);
          }
        } else {
          throw error;
        }
      }
    }

    try {
      return await callback();
    } finally {
      await this.closePromise(fd);
      await this.unlinkPromise(lockPath);
    }
  }
};

export abstract class BasePortableFakeFS extends FakeFS<PortablePath> {
  protected constructor() {
    super(ppath);
  }

  resolve(p: PortablePath) {
    return this.pathUtils.resolve(PortablePath.root, p);
  }
}
