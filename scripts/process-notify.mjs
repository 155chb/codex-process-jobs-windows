// SPDX-License-Identifier: Apache-2.0
// Status only; no payload execution or task files.
import {brokerRequest} from './broker-client.mjs';
const [id,owner,exit]=process.argv.slice(2);
if(!/^job-[0-9a-f-]{36}$/.test(id??'')||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner??'')||!/^[-]?\d+$/.test(exit??''))process.exitCode=1;
else try{const reply=await brokerRequest(owner,{kind:'completed',id,exitCode:Number(exit)});process.exitCode=reply.ok?0:1;}catch(e){console.error(e.message);process.exitCode=1;}
