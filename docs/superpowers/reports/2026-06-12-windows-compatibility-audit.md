### 审计摘要

- 审计日期：2026-06-12

- 目标：基于源码识别会影响 Windows 终端用户安装、启动和核心使用路径的兼容性风险

- 范围：终端启动、CLI/agent、进程检测、路径资源、构建安装、测试覆盖

- 方法：先全局扫描候选点，再逐层阅读源码与测试，最后定级并给出修复建议

- 结论概览：

  - 高风险确认问题：1

  - 中风险确认问题：1

  - 高风险可疑问题：0

  - 已处理但脆弱问题：1

### 问题清单

#### Windows 打包 CLI launcher 依赖外部`node.exe`

- 级别：高

- 分类：CLI 与 agent 启动

- 结论：确认风险

- 文件定位：`electron/cli-launchers.ts`、`electron-builder.yml`、`electron/main.ts`、`tests/cli-launchers.test.ts`、`hydra/tests/standalone-e2e.test.ts`

- 现象描述：Windows 安装包把`dist-cli`作为额外资源放进`resources/cli`后，会给`termcanvas`、`hydra`、`browse`以及 agent shim 生成`.cmd` launcher，但 launcher 直接执行裸`node "%~dp0\\*.js"`。对于只安装桌面版、没有单独安装 Node.js 的 Windows 用户，这条命令在 PATH 中不可解析，CLI 会在首次调用时直接失败。

- 源码证据：`electron/cli-launchers.ts`中的`getWindowsCliLauncherContent()`固定返回`@echo off\r\nnode "%~dp0\\${fileName}" %*\r\n`；`electron-builder.yml`只把`dist-cli`、`skills`、`dist-computer-use`复制到`extraResources`，没有提供可直接调用的`node.exe`；`electron/main.ts`里的`getCliDir()`在生产环境明确指向`process.resourcesPath/cli`；`tests/cli-launchers.test.ts`和`hydra/tests/standalone-e2e.test.ts`都把“系统里存在可执行的 node”当作默认前提，没有任何“无 Node 环境”的打包态断言。

- 修复建议：不要让 Windows launcher 依赖外部`node`。可选的最小修法有两条：一是安装包显式携带并定位自带 runtime，然后 launcher 用绝对路径调用；二是把这些 JS CLI 封装成真正可直接执行的本地 launcher，不再经过裸`node`命令。

- 测试建议：增加一个 Windows 打包态 smoke test，把 PATH 收缩到仅包含生成的`resources/cli`目录并执行`termcanvas.cmd --help` / `hydra.cmd --help`，要求在没有系统 Node 的前提下也能启动。

#### Windows 启动期技能集成仍依赖外部`node`和`bash`

- 级别：中

- 分类：构建、安装与打包

- 结论：确认风险

- 文件定位：`electron/cli-integration.ts`、`electron/main.ts`、`electron/skill-manager.ts`、`tests/skill-manager.test.ts`

- 现象描述：应用启动时会先执行技能集成检查，再决定是否自动注册 CLI。当前技能集成在 Windows 上会把多个外部配置写成`command: "node"`或`bash '...memory-session-start.sh'`。这要求目标机器同时具备可执行的 Node.js 和 Bash；对只安装桌面版的 Windows 用户，这两个前提都不稳，结果是技能、Hook、Computer Use MCP 注册可能静默失败，或者写入了不可执行的配置。

- 源码证据：`electron/cli-integration.ts`里的`syncCliIntegrationOnStartup()`无条件先调用`ensureSkills()`；`electron/main.ts`在`app.whenReady()`里总是执行这条启动同步链；`electron/skill-manager.ts`的`ensurePluginEnabled()`把 Claude 的 SessionStart hook 写成`bash '<sourceDir>/scripts/memory-session-start.sh'`；同文件的`ensureClaudeComputerUseMcp()`和`ensureCodexComputerUseMcp()`都把 MCP command 固定写成`node`；`ensureLifecycleHooks()`和`ensureCodexHooks()`也把生命周期 hook 固定写成`node '<script>'`；`tests/skill-manager.test.ts`直接断言这些写入值就是`command: "node"`，但没有任何 Windows 打包态或 Bash 缺失场景的保护。

- 修复建议：把技能集成拆成真正的 Windows 分支。`node`类 hook/MCP 至少要走安装包自带 runtime 或受控 launcher，`memory-session-start.sh`则需要 Windows 可执行等价物，例如`.cmd`或 PowerShell 脚本；同时把“写入配置失败”从静默吞掉升级为可见诊断。

- 测试建议：增加 Windows 专属集成测试，验证`ensureSkillLinks()`在没有系统 Node/Bash 的环境下不会写出不可执行配置；再补一个启动测试，确认`syncCliIntegrationOnStartup()`失败时会给出明确日志或 UI 提示。

#### PTY 创建重试逻辑仍然只识别 POSIX 风格瞬时错误

- 级别：低

- 分类：终端启动

- 结论：已处理但脆弱

- 文件定位：`electron/pty-manager.ts`、`tests/pty-manager.test.ts`

- 现象描述：终端启动链已经为 Windows 做了 PATH、批处理包装、PTY 原生 kill 等适配，但 PTY 创建失败后的重试逻辑仍只匹配 POSIX 风格错误文案。若 Windows 上出现 node-pty / winpty 的瞬时失败，当前实现大概率会首错即终止，而不是按既有重试机制自愈。

- 源码证据：`electron/pty-manager.ts`中的`RETRYABLE_PTY_SPAWN_ERRORS`只包含`/posix_spawnp failed/i`、`/forkpty\\(3\\) failed/i`、`/device not configured/i`；同文件`create()`只有在命中这些模式时才会重试；`tests/pty-manager.test.ts`的`create retries transient PTY spawn failures before surfacing an error`又被显式标成`{ skip: process.platform === "win32" }`，说明当前没有 Windows 侧的等价断言。

- 修复建议：补充 Windows 后端真实出现过的 PTY 瞬时失败模式，或者把重试触发从“匹配文案”提升为更稳的错误类别判断；至少要把 Windows 常见报错样本固化进白名单。

- 测试建议：补一个 Windows 分支单测，模拟 node-pty / winpty 的瞬时失败消息，断言`create()`会重试且不会因为首个瞬时错误直接把终端判死。

### 模块视图

#### 终端启动链

- `electron/pty-launch.ts`已经覆盖 Windows PATH 大小写、`ComSpec`、`.cmd/.bat`包装和批处理空格路径问题，这一层不是当前主风险来源。

- `electron/pty-manager.ts`近期又补了 Windows teardown 的 native kill 分支，和`CHANGELOG.md`里最近的`fix(pty): use native PTY kill on windows teardown`方向一致。

- 当前仍脆弱的点是 PTY 创建重试只理解 POSIX 错误模式，Windows 侧没有等价回归测试。

#### CLI 与 agent 启动链

- `electron/cli-registration.ts`对 Windows PATH 注册表的读写已经比较完整，大小写和尾斜杠比较也有测试。

- 真正的阻断点在 launcher 运行时：`electron/cli-launchers.ts`生成的 Windows `.cmd` 文件直接调用裸`node`，而打包配置没有提供这个前提。

- `cli/agent-shims/run.ts`和`hydra/src/cli-resolver.ts`对`.cmd/.bat/.ps1`做了解析和包装，但它们同样建立在“底层命令本身已经可执行”的假设上。

#### 进程检测与运行时观测链

- `electron/process-detector.ts`对 Windows 走`powershell.exe + Get-CimInstance + ConvertTo-Json -Compress`，不是把 Unix `ps` 逻辑硬搬过来。

- `tests/process-detector.test.ts`已经覆盖了 Windows 引号包裹命令、单对象 JSON 输出和`powershell.exe`命令模板。

- `electron/hook-receiver.ts`在 Windows 上改用命名管道，`tests/hook-receiver.test.ts`也有直接断言；这一层暂未发现新的确认问题。

#### 路径、文件 URL 与资源定位链

- `shared/path-comparison.ts`、`shared/project-path-match.ts`、`electron/file-url.ts`、`electron/attachment-url.ts`都已有显式 Windows 分支，重点处理了盘符、反斜杠、大小写和 file URL。

- `tests/file-url.test.ts`、`tests/attachment-url.test.ts`、`tests/project-path-match.test.ts`对 Windows 盘符和路径 round-trip 有直接覆盖。

- `CHANGELOG.md`最近 3 天内还出现了`fix: preserve unicode git paths in diffs`和`fix: restore pin attachment images on Windows`，说明这一层近期确实有回归史，但当前源码主路径已经补上显式处理。

#### 构建、安装与打包链

- `electron-builder.yml`当前只复制`dist-cli`、`skills`和`dist-computer-use`资源，没有为 Windows CLI / hook / MCP 写入链路提供自带的`node`或`bash`运行时。

- `electron/cli-integration.ts`在启动时无条件执行`ensureSkills()`，使得 skill-manager 的运行时依赖问题会提前暴露，而不是等用户手动点注册才出现。

- `scripts/postinstall.mjs`已经处理了 Windows 上通过 shell 运行 postinstall bin 的历史问题，但这只覆盖开发机依赖安装，不覆盖桌面版运行时依赖。

#### 测试覆盖与回归保护链

- 全局看，Windows 并不是完全没测：路径、URL、CLI 注册、进程检测、快捷键、终端状态等都有显式`win32`断言。

- 主要缺口集中在“打包后的 Windows 运行时前提”而不是纯函数逻辑，尤其是 launcher、skill hook、MCP command 这些当前都没有 clean-machine smoke test。

- `tests/pty-manager.test.ts`里与 Windows 最相关的一个缺口是 PTY 瞬时失败重试 case 直接 skip；这和`CHANGELOG.md`里近期多次出现的 Windows PTY 修复记录一起，说明该层仍需更强的回归保护。

### 修复优先级建议

1. Windows 打包 CLI launcher 依赖外部`node.exe`：这是直接阻断`termcanvas` / `hydra` / `browse`命令启动的高风险确认问题，优先级最高。

2. Windows 启动期技能集成仍依赖外部`node`和`bash`：这条链在每次应用启动都会触发，虽然不一定阻断主窗口打开，但会系统性破坏 Hook、技能和 MCP 集成。

3. PTY 创建重试逻辑仍然只识别 POSIX 风格瞬时错误：这不是当前最直接的阻断点，但属于已经修过多轮 Windows PTY 问题后的薄弱环节，适合在前两项修复后立即补强。
