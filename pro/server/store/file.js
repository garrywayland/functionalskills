// A store that keeps everything in one JSON file. For development, tests and a very small pilot.
import fs from 'node:fs';
import path from 'node:path';
import { MemoryStore } from './memory.js';

export class FileStore extends MemoryStore {
  constructor(dir) {
    super();
    this.kind = 'file';
    this.file = path.join(dir, 'store.json');
    fs.mkdirSync(dir, { recursive: true });
    this.queue = Promise.resolve();
    if (fs.existsSync(this.file)) {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.users = new Map(j.users || []); this.emails = new Map(j.emails || []);
      this.tokens = new Map(j.tokens || []); this.syncs = new Map(j.syncs || []);
      this.counters = new Map(j.counters || []); this.invites = new Map(j.invites || []);
      this.links = new Map(j.links || []); this.codes = new Map(j.codes || []);
      this.events = new Set(j.events || []);
    }
  }

  changed() {
    const snapshot = JSON.stringify({
      users: [...this.users], emails: [...this.emails], tokens: [...this.tokens], syncs: [...this.syncs],
      counters: [...this.counters], invites: [...this.invites], links: [...this.links], codes: [...this.codes], events: [...this.events],
    });
    this.queue = this.queue.then(() => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, snapshot);
      fs.renameSync(tmp, this.file);
    });
    return this.queue;
  }

  async close() { await this.queue; }
}
