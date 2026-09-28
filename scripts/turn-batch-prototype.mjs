// SPDX-License-Identifier: Apache-2.0
// In-memory lifecycle coordinator; transport/queue are injected by the caller.
export class TurnBatch {
  constructor(){this.turn=null;this.busy=false;this.pending=new Map();this.seen=new Set();this.wake=null;this.sequence=0;}
  start(turn){
    this.turn=turn;this.busy=true;
    // A wake already accepted or in flight may still be queued. Do not clear it
    // because an unrelated user prompt arrives: that would create duplicate wakes.
  }
  complete(id,code){
    if(this.seen.has(id))return null;
    this.seen.add(id);this.pending.set(id,{id,code});
    return this.busy?null:this.reserve();
  }
  stop(turn){
    if(turn!==this.turn)return null;
    this.busy=false;return this.reserve();
  }
  reserve(){
    if(this.wake||!this.pending.size)return null;
    const token='wake-'+(++this.sequence);this.wake={token,state:'sending'};
    return {token,kind:'completion-ready'};
  }
  accepted(token){if(this.wake?.token===token)this.wake.state='queued';}
  uncertain(token){if(this.wake?.token===token)this.wake.state='uncertain';}
  receive(token,turn){
    // Consume a matching wake only once. Include completions that happened
    // after it was queued; the notification is a doorbell, not a frozen snapshot.
    if(this.wake?.token!==token)return [];
    this.start(turn);const items=[...this.pending.values()];this.pending.clear();this.wake=null;return items;
  }
}
