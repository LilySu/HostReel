import { customAlphabet } from 'nanoid';

// URL-safe alphabet: no ambiguous chars (0/O, 1/l/I), no special chars
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

const SLUG_LENGTH = 10;
const ID_LENGTH = 16;

const slugFn = customAlphabet(ALPHABET, SLUG_LENGTH);
const idFn = customAlphabet(ALPHABET, ID_LENGTH);

/** Unguessable public share slug for a property. 10 chars from a 55-char alphabet. */
export function newShareSlug(): string {
  return slugFn();
}

/** Internal record ID (used for properties, videos, hotspots, photos). */
export function newId(): string {
  return idFn();
}
