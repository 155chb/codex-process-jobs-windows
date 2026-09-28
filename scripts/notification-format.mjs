// SPDX-License-Identifier: Apache-2.0
// Human-readable notifications; stable fields remain available for correlation.
export function exitLabel(code){
  if(!Number.isSafeInteger(Number(code)))throw Error('Invalid exit code');
  return `${Number(code)}（${Number(code)===0?'正常退出':'非零退出'}）`;
}
export function formatJobCompletion(id,code){
  return `**[CPJW] 任务完成**\n\n- 任务 ID：${id}\n- 退出码：${exitLabel(code)}`;
}
export function formatBatchCompletion(run,token,items){
  return `**[CPJW] 批量任务完成**\n\n- 通知 ID：${run}/${token}\n- 本批任务：${items.length} 个\n\n`+
    items.map(item=>`- ${item.id}：退出码 ${exitLabel(item.code)}`).join('\n');
}
export function parseBatchWake(prompt,run){
  if(typeof prompt!=='string')return null;
  const legacy=`CPJW batch-test ${run} `;
  if(prompt.startsWith(legacy)){
    const token=prompt.slice(legacy.length).split(':')[0];return /^wake-\d+$/.test(token)?token:null;
  }
  if(!prompt.startsWith('**[CPJW] 批量任务完成**\n'))return null;
  const match=prompt.match(/^- 通知 ID：([0-9a-f-]{36})\/(wake-\d+)$/m);
  return match?.[1]===run?match[2]:null;
}
