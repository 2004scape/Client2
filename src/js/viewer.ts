import 'style/viewer.scss';

import SeqType from './jagex2/config/SeqType.js';
import LocType from './jagex2/config/LocType.js';
import FloType from './jagex2/config/FloType.js';
import ObjType from './jagex2/config/ObjType.js';
import NpcType from './jagex2/config/NpcType.js';
import IdkType from './jagex2/config/IdkType.js';
import SpotAnimType from './jagex2/config/SpotAnimType.js';
import VarpType from './jagex2/config/VarpType.js';
import ComType from './jagex2/config/ComType.js';

import Draw2D from './jagex2/graphics/Draw2D.js';
import Draw3D from './jagex2/graphics/Draw3D.js';
import PixFont from './jagex2/graphics/PixFont.js';
import Model from './jagex2/graphics/Model.js';
import SeqBase from './jagex2/graphics/SeqBase.js';
import SeqFrame from './jagex2/graphics/SeqFrame.js';

import Jagfile from './jagex2/io/Jagfile.js';

import WordFilter from './jagex2/wordenc/WordFilter.js';
import {downloadText, downloadUrl} from './jagex2/util/JsUtil.js';
import GameShell from './jagex2/client/GameShell.js';
import Packet from './jagex2/io/Packet';
import Wave from './jagex2/sound/Wave';

export default class Client extends GameShell {
    static HOST: string = 'https://w2.225.2004scape.org';
    static REPO: string = 'https://raw.githubusercontent.com/2004scape/Server/main';

    alreadyStarted: boolean = false;
    errorStarted: boolean = false;
    errorLoading: boolean = false;
    errorHost: boolean = false;

    loopCycle: number = 0;
    ingame: boolean = false;
    archiveChecksums: number[] = [];

    fontPlain11: PixFont | null = null;
    fontPlain12: PixFont | null = null;
    fontBold12: PixFont | null = null;
    fontQuill8: PixFont | null = null;

    // id -> name for cache files
    packfiles: Map<number, string>[] = [];

    inputSpeedMultiplier = 2;
    model = {
        id: parseInt(GameShell.getParameter('model')) || 0,
        pitch: parseInt(GameShell.getParameter('x')) || 0,
        yaw: parseInt(GameShell.getParameter('y')) || 0,
        roll: parseInt(GameShell.getParameter('z')) || 0,
        built: null as Model | null
    };
    camera = {
        x: parseInt(GameShell.getParameter('eyeX')) || 0,
        y: parseInt(GameShell.getParameter('eyeY')) || 0,
        z: parseInt(GameShell.getParameter('eyeZ')) || 420,
        pitch: parseInt(GameShell.getParameter('eyePitch')) || 0
    };

    async loadPack(url: string): Promise<Map<number, string>> {
        const map = new Map();

        const pack = await downloadText(url);
        const lines = pack.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.indexOf('=');
            if (idx === -1) {
                continue;
            }

            const id = parseInt(line.substring(0, idx));
            const name = line.substring(idx + 1);
            map.set(id, name);
        }

        return map;
    }

    load = async (): Promise<void> => {
        if (this.alreadyStarted) {
            this.errorStarted = true;
            return;
        }

        this.alreadyStarted = true;

        try {
            await this.showProgress(10, 'Connecting to fileserver');

            const checksums = new Packet(await downloadUrl(`${Client.HOST}/crc`));
            for (let i = 0; i < 9; i++) {
                this.archiveChecksums[i] = checksums.g4;
            }

            const title = await this.loadArchive('title', 'title screen', this.archiveChecksums[1], 10);

            this.fontPlain11 = PixFont.fromArchive(title, 'p11');
            this.fontPlain12 = PixFont.fromArchive(title, 'p12');
            this.fontBold12 = PixFont.fromArchive(title, 'b12');
            this.fontQuill8 = PixFont.fromArchive(title, 'q8');

            const config = await this.loadArchive('config', 'config', this.archiveChecksums[2], 15);
            const interfaces = await this.loadArchive('interface', 'interface', this.archiveChecksums[3], 20);
            const media = await this.loadArchive('media', '2d graphics', this.archiveChecksums[4], 30);
            const models = await this.loadArchive('models', '3d graphics', this.archiveChecksums[5], 40);
            const textures = await this.loadArchive('textures', 'textures', this.archiveChecksums[6], 60);
            const wordenc = await this.loadArchive('wordenc', 'chat system', this.archiveChecksums[7], 65);
            const sounds = await this.loadArchive('sounds', 'sound effects', this.archiveChecksums[8], 70);

            await this.showProgress(75, 'Unpacking media');

            await this.showProgress(80, 'Unpacking textures');
            Draw3D.unpackTextures(textures);
            Draw3D.setBrightness(0.8);
            Draw3D.initPool(20);

            await this.showProgress(83, 'Unpacking models');
            Model.unpack(models);
            SeqBase.unpack(models);
            SeqFrame.unpack(models);

            await this.showProgress(86, 'Unpacking config');
            SeqType.unpack(config);
            LocType.unpack(config);
            FloType.unpack(config);
            ObjType.unpack(config, true);
            NpcType.unpack(config);
            IdkType.unpack(config);
            SpotAnimType.unpack(config);
            VarpType.unpack(config);

            await this.showProgress(90, 'Unpacking sounds');
            Wave.unpack(sounds);

            await this.showProgress(92, 'Unpacking interfaces');
            ComType.unpack(interfaces, media, [this.fontPlain11, this.fontPlain12, this.fontBold12, this.fontQuill8]);

            await this.showProgress(97, 'Preparing game engine');
            WordFilter.unpack(wordenc);

            await this.showProgress(100, 'Getting ready to start...');

            this.drawArea?.bind();
            Draw3D.init2D();

            await this.showModels();
        } catch (err) {
            this.errorLoading = true;
            console.error(err);
        }
    };

    update = (): void => {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            return;
        }

        this.loopCycle++;
    };

    draw = async (): Promise<void> => {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            this.drawErrorScreen();
            return;
        }

        Draw2D.clear();
        Draw2D.fillRect(0, 0, this.width, this.height, 0x000000);

        if (this.model.built === null) {
            this.model.built = new Model(this.model.id);
        }

        this.model.built.calculateNormals(64, 850, -30, -50, -30, true);
        this.model.built.drawSimple(this.model.pitch, this.model.yaw, this.model.roll, this.camera.pitch, this.camera.x, this.camera.y, this.camera.z);

        // debug
        this.fontBold12?.drawRight(this.width - 1, this.fontBold12.fontHeight, `FPS: ${this.fps}`, 0xffff00);
        this.fontBold12?.draw(1, this.fontBold12.fontHeight, `ID: ${this.model.id}`, 0xffff00);

        this.drawArea?.draw(0, 0);
    };

    //

    showProgress = async (progress: number, str: string): Promise<void> => {
        console.log(`${progress}%: ${str}`);

        await super.showProgress(progress, str);
    };

    //

    async loadArchive(filename: string, displayName: string, crc: number, progress: number): Promise<Jagfile> {
        await this.showProgress(progress, `Requesting ${displayName}`);
        const data = await Jagfile.loadUrl(`${Client.HOST}/${filename}${crc}`);
        await this.showProgress(progress, `Loading ${displayName} - 100%`);

        return data;
    }

    drawErrorScreen(): void {
        if (!this.ctx || !this.canvas) {
            return;
        }

        this.ctx.fillStyle = 'black';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.setLoopRate(1);

        if (this.errorLoading) {
            this.ctx.font = 'bold 16px helvetica, sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = 'yellow';

            let y = 35;
            this.ctx.fillText('Sorry, an error has occured whilst loading RuneScape', 30, y);

            y += 50;
            this.ctx.fillStyle = 'white';
            this.ctx.fillText('To fix this try the following (in order):', 30, y);

            y += 50;
            this.ctx.font = 'bold 12px helvetica, sans-serif';
            this.ctx.fillText('1: Try closing ALL open web-browser windows, and reloading', 30, y);

            y += 30;
            this.ctx.fillText('2: Try clearing your web-browsers cache from tools->internet options', 30, y);

            y += 30;
            this.ctx.fillText('3: Try using a different game-world', 30, y);

            y += 30;
            this.ctx.fillText('4: Try rebooting your computer', 30, y);

            y += 30;
            this.ctx.fillText('5: Try selecting a different version of Java from the play-game menu', 30, y);
        }

        if (this.errorHost) {
            this.ctx.font = 'bold 20px helvetica, sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = 'white';

            this.ctx.fillText('Error - unable to load game!', 50, 50);
            this.ctx.fillText('To play RuneScape make sure you play from', 50, 100);
            this.ctx.fillText('https://2004scape.org', 50, 150);
        }

        if (this.errorStarted) {
            this.ctx.font = 'bold 13px helvetica, sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = 'yellow';

            let y = 35;
            this.ctx.fillText('Error a copy of RuneScape already appears to be loaded', 30, y);

            y += 50;
            this.ctx.fillStyle = 'white';
            this.ctx.fillText('To fix this try the following (in order):', 30, y);

            y += 50;
            this.ctx.font = 'bold 12px helvetica, sans-serif';
            this.ctx.fillText('1: Try closing ALL open web-browser windows, and reloading', 30, y);

            y += 30;
            this.ctx.fillText('2: Try rebooting your computer, and reloading', 30, y);
        }
    }

    async showModels() {
        this.packfiles[0] = await this.loadPack(`${Client.REPO}/data/pack/model.pack`);

        const leftPanel = document.getElementById('leftPanel');
        if (leftPanel) {
            leftPanel.innerHTML = '';

            {
                const input = document.createElement('input');
                input.type = 'search';
                input.placeholder = 'Search';
                input.oninput = () => {
                    const filter = input.value.toLowerCase().replaceAll(' ', '_');

                    for (let i = 0; i < ul.children.length; i++) {
                        const child = ul.children[i] as HTMLElement;

                        if (child.id.indexOf(filter) > -1) {
                            child.style.display = '';
                        } else {
                            child.style.display = 'none';
                        }
                    }
                };
                leftPanel.appendChild(input);
            }

            // create a clickable list of all the files in the pack, that sets this.model.id on click
            const ul = document.createElement('ul');
            ul.className = 'list-group';
            leftPanel.appendChild(ul);

            for (const [id, name] of this.packfiles[0]) {
                const li = document.createElement('li');
                li.id = name;
                li.className = 'list-group-item';
                if (id == 0) {
                    li.className += ' active';
                }
                li.innerText = name;
                li.onclick = () => {
                    // unmark the last selected item
                    const last = ul.querySelector('.active');
                    if (last) {
                        last.className = 'list-group-item';
                    }

                    // mark the new selected item
                    li.className = 'list-group-item active';

                    this.model.id = id;
                    this.model.built = new Model(this.model.id);
                };
                ul.appendChild(li);
            }
        }
    }
}

const client = new Client();
client.run().then(() => {});