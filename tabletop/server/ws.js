'use strict';
// Minimal RFC 6455 WebSocket server (text frames, ping/pong, fragmentation). No dependencies.
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 4 * 1024 * 1024;

class Conn {
  constructor(socket) {
    this.socket = socket; this.alive = true; this.closed = false;
    this.onmessage = null; this.onclose = null; this.data = {};
    let buf = Buffer.alloc(0); let frags = []; let fragOp = 0;
    const fail = () => { try { this.close(1009); } catch (e) { /* already closed */ } };
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2) {
        const b0 = buf[0], b1 = buf[1];
        const fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(2) * 4294967296 + buf.readUInt32BE(6); off = 10; }
        if (len > MAX_PAYLOAD) return fail();
        const need = off + (masked ? 4 : 0) + len;
        if (buf.length < need) return;
        const payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
        if (masked) { const m = buf.subarray(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
        buf = buf.subarray(need);
        if (op === 8) { this.close(1000); return; }
        if (op === 9) { this._frame(10, payload); continue; }
        if (op === 10) { this.alive = true; continue; }
        if (op === 1 || op === 2) { fragOp = op; frags = [payload]; } else if (op === 0) frags.push(payload);
        if (fin && (op === 0 || op === 1 || op === 2)) {
          const full = Buffer.concat(frags); frags = [];
          if (fragOp === 1 && this.onmessage) { try { this.onmessage(full.toString('utf8')); } catch (e) { console.error('ws handler error', e); } }
        }
      }
    });
    const done = () => { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(); };
    socket.on('close', done); socket.on('error', done); socket.on('end', done);
  }
  _frame(op, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length; let header;
    if (len < 126) header = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeUInt32BE(Math.floor(len / 4294967296), 2); header.writeUInt32BE(len >>> 0, 6); }
    this.socket.write(Buffer.concat([header, payload]));
  }
  send(obj) { this._frame(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))); }
  close(code = 1000) { const p = Buffer.alloc(2); p.writeUInt16BE(code); this._frame(8, p); this.socket.end(); }
}

function attach(server, onConnection) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    onConnection(new Conn(socket), req);
  });
}
function keepalive(conns, ms = 25000) {
  return setInterval(() => {
    for (const c of conns()) { if (!c.alive) { try { c.socket.destroy(); } catch (e) { /* ignore */ } continue; } c.alive = false; c._frame(9, Buffer.alloc(0)); }
  }, ms).unref();
}
module.exports = { attach, keepalive, Conn };
