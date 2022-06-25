import { lstatSync, readdirSync, Dirent } from 'fs';
import { join, basename, resolve, dirname } from 'path';

export type WalkFunc = (pathName: string, dirent: Dirent | Error) => Boolean | void;

function lstatSafe(pathName: string): Dirent | Error {
  try { const result = lstatSync(pathName) as unknown as Dirent; result.name = basename(resolve(pathName)); return result; }
  catch (err) { return err }
}

function readdirSafe(pathName: string): Dirent[] | Error[] {
  try { return readdirSync(pathName, { withFileTypes: true }); }
  catch (err) { return [err] }
}

function walkDeep(pathName: string, walkFunc: WalkFunc, dirent: Dirent | Error) {
  // If the callback returns false, the Dirent errored, or entry is a file, we can skip. Otherwise, walk our directory.
  if (walkFunc(dirname(pathName), dirent) === false || dirent instanceof Error || !dirent.isDirectory()) { return; }
  for (const entry of readdirSafe(pathName)) { walkDeep(join(pathName, entry.name), walkFunc, entry) }
}

// Get the very first file or folder an walk deep.
const walk = (pathName: string, walkFunc: WalkFunc) => walkDeep(pathName, walkFunc, lstatSafe(pathName));
export default walk;
