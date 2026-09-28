// SPDX-License-Identifier: Apache-2.0
// No retry after dispatch starts: uncertain acceptance must never duplicate a turn.
export class CompletionBuffer {
  constructor(){this.pending=new Map();this.seen=new Set();}
  add(item){if(this.seen.has(item.id))return false;this.seen.add(item.id);this.pending.set(item.id,item);return true;}
  take(){const items=[...this.pending.values()];this.pending.clear();return items;}
  get size(){return this.pending.size;}
}
