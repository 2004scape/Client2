import {decompress} from '../../vendor/bz2.js';

export const sleep = async (ms: number): Promise<void> => new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, ms));
export const downloadUrl = async (url: string): Promise<Int8Array> => new Int8Array(await (await fetch(url)).arrayBuffer());
export const downloadText = async (url: string): Promise<string> => (await fetch(url)).text();

const bz2Header: Uint8Array = Uint8Array.from(['B'.charCodeAt(0), 'Z'.charCodeAt(0), 'h'.charCodeAt(0), '1'.charCodeAt(0)]);

export const decompressBz2 = (data: Uint8Array, addMagic: boolean = true, prepend: boolean = true): Uint8Array => {
    if (addMagic) {
        if (prepend) {
            const temp: Uint8Array = data;
            data = new Uint8Array(bz2Header.length + data.length);
            data.set(temp, bz2Header.length);
        }

        data.set(bz2Header, 0);
    }

    return decompress(data);
};

const canvas: HTMLCanvasElement = document.createElement('canvas');
const img: HTMLImageElement = document.createElement('img');
const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d', {willReadFrequently: true});

export const decodeJpeg = async (data: Uint8Array): Promise<ImageData> => {
    if (data[0] !== 0xff) {
        // fix invalid JPEG header
        data[0] = 0xff;
    }

    URL.revokeObjectURL(img.src); // Remove previous decoded jpeg.
    img.src = URL.createObjectURL(new Blob([data], {type: 'image/jpeg'}));

    // wait for img to load
    await new Promise<void>((resolve): (() => void) => (img.onload = (): void => resolve()));

    if (!ctx) {
        throw new Error('Canvas 2d not found!!!!!!!!');
    }
    // Clear the canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width: number = img.naturalWidth;
    const height: number = img.naturalHeight;
    canvas.width = width;
    canvas.height = height;

    // Draw the image
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, width, height);
};

export const arraycopy = (src: Int32Array | Uint8Array | Uint8ClampedArray, srcPos: number, dst: Int32Array | Uint8Array, dstPos: number, length: number): void => {
    while (length--) dst[dstPos++] = src[srcPos++];
};

export const bytesToBigInt = (bytes: Uint8Array): bigint => {
    let result: bigint = BigInt(0);
    for (let index: number = 0; index < bytes.length; index++) {
        result = (result << BigInt(8)) + BigInt(bytes[index]);
    }
    return result;
};

export const bigIntToBytes = (bigInt: bigint): Uint8Array => {
    const byteArray: number[] = [];
    while (bigInt > BigInt(0)) {
        byteArray.unshift(Number(bigInt & BigInt(0xff)));
        bigInt >>= BigInt(8);
    }
    return new Uint8Array(byteArray);
};

export const bigIntModPow = (base: bigint, exponent: bigint, modulus: bigint): bigint => {
    let result: bigint = BigInt(1);
    while (exponent > BigInt(0)) {
        if (exponent % BigInt(2) === BigInt(1)) {
            result = (result * base) % modulus;
        }
        base = (base * base) % modulus;
        exponent >>= BigInt(1);
    }
    return result;
};