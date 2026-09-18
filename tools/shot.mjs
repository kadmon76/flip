// tools/shot.mjs — phone-size screenshot of a page via headless Chromium over the DevTools protocol.
// Usage: node tools/shot.mjs <url> <out.png> [--eval '<js>'] [--wait <ms>] [--viewport <WxH>]
//   --eval  JS evaluated in the page after load; a returned promise is awaited. Drive screens with window.flip.setState(...).
//   --wait  extra ms to sleep after document.fonts.ready before capturing (default 300).
// --viewport WxH CSS px (default 360x740) at device scale 2 -> a 2Wx2H PNG (720x1480). Node 22 built-ins only. Exits 1 on any failure.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_VIEWPORT = { width: 360, height: 740 };
const DEVICE_SCALE = 2;
const DEFAULT_WAIT_MS = 300;
const STEP_TIMEOUT_MS = 15000;   // any single CDP step (launch, navigate, eval, capture)

// --- args ---------------------------------------------------------------

function usage(msg) {
    if (msg) console.error(`shot: ${msg}`);
    console.error("usage: node tools/shot.mjs <url> <out.png> [--eval '<js>'] [--wait <ms>] [--viewport <WxH>]");
    process.exit(1);
}

function parseArgs(argv) {
    const positional = [];
    let evalJs = null;
    let waitMs = DEFAULT_WAIT_MS;
    let viewport = { ...DEFAULT_VIEWPORT };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--eval') {
            if (i + 1 >= argv.length) usage('--eval needs a value');
            evalJs = argv[++i];
        } else if (a === '--wait') {
            if (i + 1 >= argv.length) usage('--wait needs a value');
            waitMs = Number(argv[++i]);
            if (!Number.isInteger(waitMs) || waitMs < 0) usage('--wait must be a non-negative integer (ms)');
        } else if (a === '--viewport') {
            if (i + 1 >= argv.length) usage('--viewport needs a value');
            const m = argv[++i].match(/^(\d+)x(\d+)$/);
            if (!m || Number(m[1]) < 1 || Number(m[2]) < 1) usage('--viewport must be <width>x<height> in CSS px, e.g. 360x740');
            viewport = { width: Number(m[1]), height: Number(m[2]) };
        } else if (a.startsWith('--')) {
            usage(`unknown option ${a}`);
        } else {
            positional.push(a);
        }
    }
    if (positional.length !== 2) usage('expected exactly <url> and <out.png>');
    const [url, out] = positional;
    let parsed;
    try { parsed = new URL(url); } catch { usage(`invalid url ${url}`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) usage('url must be http(s)');
    if (!out.toLowerCase().endsWith('.png')) usage('output file must end with .png');
    return { url, out, evalJs, waitMs, viewport };
}

// --- chromium -----------------------------------------------------------

// Newest chromium-<rev> under ~/.cache/ms-playwright, else newest
// chromium_headless_shell-<rev>. CHROMIUM=/path overrides.
function findChromium() {
    if (process.env.CHROMIUM) {
        if (!fs.existsSync(process.env.CHROMIUM)) throw new Error(`CHROMIUM=${process.env.CHROMIUM} does not exist`);
        return process.env.CHROMIUM;
    }
    const root = path.join(os.homedir(), '.cache', 'ms-playwright');
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { throw new Error(`${root} not found`); }
    const newest = (prefix, bin) => {
        const hits = entries
            .map((d) => ({ d, m: d.match(new RegExp(`^${prefix}-(\\d+)$`)) }))
            .filter((x) => x.m)
            .sort((a, b) => Number(b.m[1]) - Number(a.m[1]))
            .map((x) => path.join(root, x.d, 'chrome-linux', bin))
            .filter((p) => fs.existsSync(p));
        return hits[0];
    };
    const found = newest('chromium', 'chrome') || newest('chromium_headless_shell', 'headless_shell');
    if (!found) throw new Error(`no chromium-*/chrome-linux/chrome under ${root}`);
    return found;
}

function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(binary, userDataDir) {
    const args = [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--hide-scrollbars',
        '--mute-audio',
        'about:blank',
    ];
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const wsUrl = new Promise((resolve, reject) => {
        let buf = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
            buf += chunk;
            const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
            if (m) resolve(m[1]);
        });
        child.on('error', (e) => reject(new Error(`could not launch ${binary}: ${e.message}`)));
        child.on('exit', (code) => reject(new Error(`chromium exited early (code ${code})\n${buf.trim()}`)));
    });
    return { child, wsUrl };
}

// --- minimal CDP client -------------------------------------------------

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.seq = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id !== undefined) {
                const p = this.pending.get(msg.id);
                if (!p) return;
                this.pending.delete(msg.id);
                if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
                else p.resolve(msg.result);
            } else {
                this.listeners.forEach((fn) => fn(msg));
            }
        });
        ws.addEventListener('close', () => {
            for (const p of this.pending.values()) p.reject(new Error(`${p.method}: connection closed`));
            this.pending.clear();
        });
    }

    static connect(url) {
        return withTimeout(new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            ws.addEventListener('open', () => resolve(new CDP(ws)));
            ws.addEventListener('error', () => reject(new Error(`websocket connect failed: ${url}`)));
        }), STEP_TIMEOUT_MS, 'connect to DevTools');
    }

    send(method, params = {}, sessionId) {
        const id = ++this.seq;
        const p = new Promise((resolve, reject) => this.pending.set(id, { method, resolve, reject }));
        this.ws.send(JSON.stringify({ id, method, params, sessionId }));
        return withTimeout(p, STEP_TIMEOUT_MS, method);
    }

    // Resolves with the params of the first event matching `filter`.
    once(method, filter = () => true) {
        return new Promise((resolve) => {
            const fn = (msg) => {
                if (msg.method === method && filter(msg.params, msg.sessionId)) {
                    this.listeners.splice(this.listeners.indexOf(fn), 1);
                    resolve(msg.params);
                }
            };
            this.listeners.push(fn);
        });
    }

    on(method, fn) {
        this.listeners.push((msg) => { if (msg.method === method) fn(msg.params); });
    }

    close() {
        try { this.ws.close(); } catch { /* already closed */ }
    }
}

// --- png ----------------------------------------------------------------

function pngSize(buf) {
    const sig = '89504e470d0a1a0a';
    if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== sig) throw new Error('output is not a PNG');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- main ---------------------------------------------------------------

async function shoot({ url, out, evalJs, waitMs, viewport }, cdp) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);

    // The document response arrives before Page.navigate resolves, so learn
    // the main frame id up front rather than from the navigate result.
    const { frameTree } = await page('Page.getFrameTree');
    const mainFrameId = frameTree.frame.id;
    let docStatus = null;
    cdp.on('Network.responseReceived', (p) => {
        if (p.type === 'Document' && p.frameId === mainFrameId) docStatus = p.response.status;
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
        const d = p.exceptionDetails;
        console.error(`shot: page error: ${d.exception?.description || d.text}`);
    });

    await page('Page.enable');
    await page('Runtime.enable');
    await page('Network.enable');
    await page('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: DEVICE_SCALE, mobile: true });
    await page('Emulation.setTouchEmulationEnabled', { enabled: true });

    const loaded = cdp.once('Page.loadEventFired', (_, sid) => sid === sessionId);
    const nav = await page('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navigation failed: ${nav.errorText} (${url})`);
    await withTimeout(loaded, STEP_TIMEOUT_MS, 'page load');
    if (docStatus !== null && docStatus >= 400) throw new Error(`navigation failed: HTTP ${docStatus} (${url})`);

    const evaluate = async (expression, label) => {
        const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            throw new Error(`${label} threw: ${d.exception?.description || d.text}`);
        }
        return r.result?.value;
    };

    if (evalJs !== null) await evaluate(evalJs, '--eval');
    await evaluate('document.fonts.ready.then(() => true)', 'document.fonts.ready');
    await sleep(waitMs);

    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    const { width, height } = pngSize(buf);
    const want = { width: viewport.width * DEVICE_SCALE, height: viewport.height * DEVICE_SCALE };
    if (width !== want.width || height !== want.height) {
        throw new Error(`screenshot is ${width}x${height}, expected ${want.width}x${want.height}`);
    }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log(`shot: wrote ${out} (${width}x${height})`);
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    let userDataDir = null;
    let child = null;
    let cdp = null;

    const cleanup = () => {
        if (cdp) cdp.close();
        if (child && child.exitCode === null) child.kill('SIGKILL');
        if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    };
    process.on('exit', cleanup);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

    try {
        const binary = findChromium();
        userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flip-shot-'));
        const launched = launch(binary, userDataDir);
        child = launched.child;
        const wsUrl = await withTimeout(launched.wsUrl, STEP_TIMEOUT_MS, 'chromium DevTools start');
        cdp = await CDP.connect(wsUrl);
        await shoot(opts, cdp);
        await cdp.send('Browser.close').catch(() => {});
    } catch (e) {
        console.error(`shot: error: ${e.message}`);
        process.exitCode = 1;
    } finally {
        cleanup();
    }
}

main();
