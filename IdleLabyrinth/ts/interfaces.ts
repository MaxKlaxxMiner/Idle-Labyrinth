/* tslint:disable:one-line max-line-length interface-name comment-format */

declare class Uint8ClampedArray
{
  constructor(buf: ArrayBuffer);
}

interface Array<T>
{
  set(o: Uint8ClampedArray): void;
}
