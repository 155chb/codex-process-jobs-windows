// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import {startBroker} from './completion-broker.mjs';
const [id,owner,shell,threshold,rollout]=process.argv.slice(2);
const budget=Number(threshold);
if(!/^job-[0-9a-f-]{36}$/.test(id??'')||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner??'')||!Number.isFinite(budget)||budget<0||budget>30000||!rollout||!fs.existsSync(rollout)){
 console.error('Invalid observer parameters');process.exitCode=1;
}else try{await startBroker({id,owner,shell,budget,rollout});}catch(e){console.error(e.message);process.exitCode=1;}
