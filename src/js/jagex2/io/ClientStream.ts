import {arraycopy, sleep} from '../util/JsUtil';

export type Socket = {
    host: string;
    port: number;
};

export default class ClientStream {
    // constructor
    private readonly socket: WebSocket;

    // runtime
    private readonly queue: Int8Array[] = [];
    private buffer: Int8Array | undefined = undefined;
    private remaining: number = 0;
    private offset: number = 0;

    static openSocket = async (socket: Socket): Promise<WebSocket> => {
        return await new Promise<WebSocket>((resolve, reject): void => {
            const secured: boolean = socket.host.startsWith('https');
            const protocol: string = secured ? 'wss' : 'ws';
            const host: string = socket.host.substring(socket.host.indexOf('//') + 2);
            const port: number = secured ? socket.port + 2 : socket.port + 1;
            const ws: WebSocket = new WebSocket(`${protocol}://${host}:${port}`, 'binary');
            ws.binaryType = 'arraybuffer';

            ws.addEventListener('open', (): void => {
                console.log('connection open!');
                resolve(ws);
            });

            ws.addEventListener('error', (): void => {
                console.log('connection error!');
                reject(ws);
            });
        });
    };

    constructor(socket: WebSocket) {
        socket.onmessage = this.onmessage;
        socket.onclose = this.onclose;
        socket.onerror = this.onerror;
        this.socket = socket;
    }

    get host(): string {
        return this.socket.url.split('/')[2];
    }

    get port(): number {
        return parseInt(this.socket.url.split(':')[2], 10);
    }

    get available(): number {
        return this.remaining;
    }

    write = (src: Uint8Array, len: number, off: number): void => {
        if (this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Socket is not able to write!');
        }
        const data: Uint8Array = new Uint8Array(len);
        arraycopy(src, off, data, 0, len);
        this.socket.send(data);
    };

    read = async (): Promise<number> => {
        if (this.socket.readyState !== WebSocket.OPEN && this.remaining < 1) {
            throw new Error('Socket is not able to read!');
        }

        if (this.remaining < 1) {
            await sleep(1);
            return this.read();
        }

        if (!this.buffer) {
            this.buffer = this.queue.shift();
            if (this.buffer) {
                this.offset = 0;
            }
        }

        if (!this.buffer) {
            return this.read();
        }

        const value: number = this.buffer[this.offset] & 0xff;
        this.offset++;
        this.remaining--;

        if (this.offset === this.buffer.length) {
            this.buffer = undefined;
        }
        return value;
    };

    readBytes = async (dst: Uint8Array, off: number, len: number): Promise<void> => {
        if (this.socket.readyState !== WebSocket.OPEN && this.remaining < 1) {
            throw new Error('Socket is not able to read!');
        }

        if (len < 1) {
            // check for 0 so it doesnt await for no reason
            // (i.e close interface packet)
            return;
        }

        if (this.remaining < 1) {
            await sleep(1); // TODO maybe not do this?
            return this.readBytes(dst, off, len);
        }

        for (let index: number = 0; index < len; index++) {
            dst[off + index] = await this.read();
        }
    };

    close = (): void => {
        if (this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.socket.close();
    };

    clear = (): void => {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.queue.length = 0;
        this.remaining = 0;
        this.buffer = undefined;
        this.offset = 0;
    };

    private onmessage = (event: MessageEvent): void => {
        // console.log('connection message!');
        const data: Int8Array = new Int8Array(event.data);
        this.remaining += data.length;
        this.queue.push(data);
    };

    private onclose = (event: CloseEvent): void => {
        console.log('connection close!');
    };

    private onerror = (event: Event): void => {
        console.log('connection error!');
    };
}
