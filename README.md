# Codex Process Jobs Windows

实验版 **0.5.1**。Windows 非交互 PowerShell 长任务的原生输出与隐式完成唤醒。
借鉴 [Joel Farthing 的 Codex Process Jobs](https://github.com/joelfarthing/codex-process-jobs)；Apache-2.0。Desktop IPC 协议适配部分为 MIT，来源见 NOTICE 和 licenses。非 OpenAI 或上游官方插件。

## 项目来源与许可证

CPJW 是独立维护的 Windows 实验实现，参考了 CPJ 的后台任务与完成通知设计，并改写了部分上游代码；它不是 CPJ 的官方 Windows 版本。上游作者、对应源码版本、改写文件及另一处 MIT 授权代码的来源均列于 [NOTICE](NOTICE)。仓库主许可证为 [Apache-2.0](LICENSE)，MIT 授权文本保存在 [licenses/open-cross-session-MIT.txt](licenses/open-cross-session-MIT.txt)。

## 工作流程

1. 已信任的 PreToolUse Hook 包装普通 PowerShell 命令。载荷仍由 Codex 原来的沙箱和审批执行，stdout/stderr 保留在原生执行会话。
2. 宿主侧观察器按唯一任务 ID 查找包装进程，持有 Windows 进程句柄，等待退出，读取真实退出码；不执行任务载荷。
3. **运行时间超过 30 秒**才发送完成状态。30 秒及以下不唤醒。阈值是实际进程存活时间，不是 Agent 猜测。
4. 每个聊天一个内存 broker。多个观察器通过插件自己的命名管道提交 ID 和退出码；消息不包含可执行命令。已完成任务去重、合并。
5. broker 使用 Stop/UserPromptSubmit 信号和 Codex 现有 rollout 文件的变化事件等待空闲。完成后先延时 5 秒，再要求同一个已完成轮次稳定 5 秒；初始化 Desktop IPC 后第三次复查，并立即提交。
6. 隐式工具结果 `cpjw_completed_jobs` 携带任务 ID、退出码。使用 `input: []`，不新增普通用户通知消息。没有自动 Queue 兜底。
7. Agent 根据本聊天原工具结果，将任务 ID 对应到原 session ID，通过 `write_stdin` 一次取回输出与结束码。没有额外任务状态文件或 stdout/stderr 日志。

任务开始后首次观察需要短暂查询 Windows 进程；附着后使用进程退出等待。broker 使用文件变化事件和延时计时器，不让 Agent 轮询。短任务结束后也会回收对应观察器。所有任务与通知处理结束后 broker 空闲 10 秒退出；最长期限 65 分钟。

## 安装与配置

需要 Windows、Node.js 20+、PowerShell，以及支持当前私有 IPC 协议的 Codex Desktop。使用个人 marketplace 重新安装后开启并审阅信任 Hook；新聊天用于确认已卸载旧技能。

私有配置位于 `~/.codex/process-jobs-windows/settings.json`：

```json
{
  "enabled": true,
  "powershellPath": "你的 pwsh.exe 的绝对路径",
  "notifyAfterMs": 30000
}
```

没有配置默认关闭。`CPJW_ENABLE_NATIVE_HOOK=0` 可显式关闭。观察器通过 Hook 提供的当前 `transcript_path` 读取现有 rollout；没有有效路径则不接管命令。没有 SKILL 或 PreToolUse additionalContext。包装器不向 stdout/stderr 写入任何任务状态说明，无论命令运行多久都只转发载荷输出。工具的等待时长保持原设置，因此 Agent 可能在阈值前按原生行为等待或收取输出，提示也只能在下一次原生输出交付时被看到。

## 已验证和未保证的部分

- 34 项自动测试通过：原生 stdout/stderr、非零退出码、引号、禁止载荷写文件、共享管道、空闲检查、合并、重复完成、失去回执不重发等。
- 2 项真实 Windows 宿主观察器测试通过：保留进程句柄、真实退出码 7、30 秒阈值过滤与通知禁用。
- 之前的隔离实验已验证当前 Desktop 能接收隐式 toolOutput，及先 Queue 后 IPC 的分开轮次。
- 本版真实 32 秒命令实测通过：Windows 观察器提交退出码 0，新版 broker 隐式唤醒当前聊天，原生执行会话取回 stderr 和结束标记，最终退出码为 0。
- 安装后的 PreToolUse Hook 已实际包装短命令并返回原生输出；最后一瞬间的用户提交竞争仍未解决。

## 已知限制与手动恢复

- 最后一瞬间用户提交与 IPC 启动仍可能竞争，可能导致界面一直“正在思考”。空闲检查和延时只能减低概率，**没有可量化的发生概率，也不保证消除**。
- IPC 发送开始后，错误、超时或回执丢失都不自动重发，避免重复启动；任务失败退出码也是正常的完成状态，不是通知器故障。
- IPC 初始化失败时保留内存待发送结果，下一次生命周期或文件变化时重新检查；没有持续定时重试。Codex 关闭、broker 超时后内存结果消失。
- 若界面卡住：重启 Codex，回到原聊天手动发送“继续检查刚才任务”。原生会话若仍可用则收取一次；会话被回收时无法恢复输出，不应盲目重跑有副作用的命令。
- 私有 Desktop IPC 非稳定接口。升级 Codex 后可能失效；不能把接受请求当作 Agent 已成功处理结果。
- 不支持交互 stdin、终端 Profile 状态、持续守护进程、远端已脱离的任务或 GUI 程序。包装器仍有额外启动开销。
- 当前 0.5.1 默认 Hook 不创建任务状态文件，也不保存载荷 stdout/stderr。仓库保留的旧 `auto-run.mjs` / `job.mjs` 是独立实验路径，只有显式运行这些脚本或对应测试时才会在指定状态目录写入 `job.json` 和测试输出；它们不是默认 Hook 的调用链。测试模式可用 `CODEX_PROCESS_JOBS_DISABLE_CODEX_QUEUE=1` 禁用观察器通知（沿用旧变量名）。

## 开发验证

`npm test` 只运行 `*.test.mjs`，不会误跑需要单次授权的 CLI 实验入口。宿主测试另设 `CPJW_RUN_HOST_TESTS=1`。`npm run check` 检查生产入口语法。不得提交私有配置、凭据、真实会话输出或测试状态目录。

## 0.4.1 修正

删除 start/result SKILL 和默认调用提示；删除执行前 additionalContext；任务 ID 和接管说明仅在实际超过 30 秒后输出。保持宿主观察器和完成 IPC 的路径，不通过技能提前改变 Agent 决策。PreToolUse 仍必须提前静默附着观察器，且工具命令显示仍会包含包装路径；当前 Hook 无法隐藏改写的命令或强制原生工具在第 30 秒返回。尚未完成新会话集成验证。

## 0.4.2 输出污染修正

撤回 0.4.1 写入 stdout 的超时说明；载荷输出始终只通过原生 stdout/stderr 传递。完成 IPC 只包含任务标识与退出码，不包含载荷输出。任务标识仍位于原命令参数中，可用于对应原生 session。超过 30 秒时的独立 Hook 上下文通知尚未实现，必须先确认接口支持；当前修正不能宣称已满足完整接管行为。

接口证据：Codex `core/src/tools/context.rs` 中 `ExecCommandToolOutput::post_tool_use_response` 对仍有 `process_id` 的结果返回 None，故运行中的 exec/write_stdin 不触发 Bash PostToolUse。来源：https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/context.rs 。不能通过 PostToolUse 在 30 秒时告知接管，不宣称自动终止 Agent 等待已实现。

## 0.5.0 异步接管候选版

使用同步 PreToolUse 仅静默包装并附着原有完成观察器；另一个 `async: true` 的 PreToolUse 通过唯一 tool_use_id 观察同一包装进程，保留进程句柄。阈值前退出返回空 JSON；实际超过 30 秒仍在运行时返回一次 additionalContext。该说明通过 Codex 后台 Hook 的上下文通道交付，不写入载荷 stdout/stderr，也不替换工具结果。无 SKILL，不提前注入说明。

上下文在当前工具调用结束后的安全点交付；不能强制打断正在阻塞的工具调用。若轮次已结束，后台 Hook 上下文等待下一轮，不自行启动轮次；完成 IPC 仍负责唤醒。命令显示仍包含包装路径。当前长任务上下文只含任务/工具标识与命令引用，不含载荷输出。

已验证：13 项单元/行为测试、两个真实 Windows 阈值观察用例（真实进程句柄、短任务无说明、长任务识别、原生 stdout/stderr 精确保持）。尚需新会话验证异步上下文交付和 Agent 停止轮询。

官方机制：https://learn.chatgpt.com/docs/hooks#run-hooks-in-the-background 。保留 Apache-2.0 / MIT 来源说明。

## 0.5.0 新会话观察与 0.5.1 修正

新会话（2026-09-27）实测：短任务输出只包含 SHORT_BEGIN/SHORT_END；65 秒任务原生输出只包含 LONG_BEGIN、STDERR_MARKER、LONG_END，退出码均为 0。异步说明通过 `hooks.additional_context` 的 developer 消息交付，独立于命令输出。Agent 在收到说明时已有 `functions.exec` 单元等待 write_stdin；随后仍使用 wait/sleep，未提前结束本轮，因此不能判定接管已成功。

0.5.1 补充现有执行单元交接：明确禁止继续 sleep/等待；结束本轮时保留原生 session ID 和已经存在的 cell ID；完成唤醒后优先收取已有 cell，不创建第二个原生输出收集器。此行为修正尚需新会话验证。
