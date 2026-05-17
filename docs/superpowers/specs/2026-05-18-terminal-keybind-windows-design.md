### 背景

`TODO.md`已经记录了当前终端快捷键与 Windows 终端习惯不匹配的问题：

- Windows 下`Ctrl+V`没有按用户预期执行文本粘贴，而是落成原始`^V`，或者触发现有图片粘贴链路

- `Ctrl+Shift+V`目前能稳定粘贴文本，但不符合`cmd.exe` / PowerShell 的默认肌肉记忆

- `Ctrl+C`当前直接落给前台 CLI，导致在有选区时也会表现成中断/结束会话，而不是优先复制

当前代码里，终端宿主层已经在`src/terminal/terminalRuntimeStore.ts`使用`xterm.attachCustomKeyEventHandler()`拦截按键，但只处理了应用级快捷键过滤和 macOS 下的`Meta+Backspace`特殊行为，还没有系统化处理平台级复制/粘贴语义。

本次工作的目标不是开放用户自定义快捷键，也不是修改 CLI 行为，而是修正终端宿主层的默认键位语义，让 Windows 用户在应用内终端获得接近系统终端的体验，同时补齐 macOS / Linux 的明确策略。

### 目标

- 修正 Windows 内嵌终端的默认文本复制/粘贴行为，使之尽可能接近`cmd.exe` / PowerShell

- 在宿主层处理复制/粘贴快捷键，不把`Ctrl+V`直接送入 PTY 变成原始控制字符

- 修正`Ctrl+C`在 Windows 下的“复制优先于中断”语义：

  - 有选区时复制

  - 无选区时保持终端原生中断行为

- 明确 macOS / Linux 的文本复制/粘贴策略，避免不同平台行为继续隐式漂移

- 保持`Alt+V`现有图片粘贴行为不变，不把图片链路纳入本轮改造

### 非目标

- 不开放用户自定义终端快捷键配置

- 不改全局应用快捷键体系，不把终端复制/粘贴塞进`shortcutStore`

- 不修改 composer 的图片粘贴、文本注入或发送流程

- 不修改 CLI 层协议，不在 CLI 内部实现 Windows 特化键位

- 不改变`Alt+V`图片粘贴行为

### 现状分析

当前项目中的相关事实如下：

- 终端实例在`src/terminal/terminalRuntimeStore.ts`中创建，并通过`xterm.attachCustomKeyEventHandler()`做宿主层按键拦截

- 宿主层已有复制相关基础设施：

  - `xterm.getSelection()`

  - `navigator.clipboard.writeText()`

  - `bumpCopiedNonce()`

  - `attachOptions?.onCopy?.()`

- 项目当前没有单独的“terminal paste IPC”，但 xterm 官方公开提供了`Terminal.paste(text)`作为宿主层文本粘贴入口，且支持 bracketed paste mode，因此不应通过伪造按键或逐字调用`terminal.input()`来实现文本粘贴

- 非 macOS 平台的应用级快捷键默认已经迁移为`Alt+...`，例如`openTerminalFind`是`alt+f`，因此 Windows 下`Ctrl+V`、`Ctrl+C`并不会天然和画布全局快捷键产生主冲突

- 当前`TODO.md`已经明确要求在终端宿主层而不是 CLI 层处理 Windows 文本粘贴快捷键

### 设计原则

- 平台默认优先：修复的是平台约定，不是用户个性化偏好

- 宿主层收口：所有终端复制/粘贴修正都在 xterm 宿主层完成

- 最小改动：不扩散到全局快捷键存储或设置系统

- 复制/粘贴优先使用显式 API：复制走剪贴板写入，粘贴走`xterm.paste(text)`

- 失败不退化为控制字符污染：粘贴失败时不能回退成原始`^V`

### 平台按键矩阵

#### Windows

- `Ctrl+V`：文本粘贴

- `Ctrl+Shift+V`：文本粘贴

- `Shift+Insert`：文本粘贴

- `Ctrl+C`：若当前有选区，则复制选中文本；若无选区，则放行给终端/PTY，保持中断前台进程

- `Ctrl+Insert`：复制选中文本

- `Alt+V`：保持现状，继续作为已存在的图片粘贴入口，本轮不修改

#### macOS

- `Cmd+V`：文本粘贴

- `Cmd+C`：若当前有选区，则复制；若无选区，则保持终端默认行为

- 保留现有`Meta+Backspace -> \x15`逻辑，不并入本轮重构范围

#### Linux

- `Ctrl+Shift+V`：文本粘贴

- `Ctrl+Shift+C`：若当前有选区，则复制

- `Ctrl+V`：保持终端传统语义，不改

- `Ctrl+C`：保持终端传统语义，不改

### 实现方案

采用“runtime store 接线 + 小型辅助函数”的最小宿主拦截方案。

#### 改动位置

只在以下文件落实现与测试：

- `src/terminal/terminalRuntimeStore.ts`

- `tests/terminal-runtime-store.test.ts`

#### 结构设计

在`src/terminal/terminalRuntimeStore.ts`中，保留现有`attachCustomKeyEventHandler()`接线点，但将平台复制/粘贴逻辑拆为私有辅助函数，避免匿名回调继续膨胀。建议辅助函数职责如下：

- `getTerminalHostPlatform()`
  - 读取当前平台，优先使用`window.termcanvas.app.platform`

- `isTerminalPasteShortcut(event, platform)`
  - 判断当前按键是否命中文本粘贴快捷键

- `isTerminalCopyShortcut(event, platform)`
  - 判断当前按键是否命中文本复制快捷键

- `copyTerminalSelection(runtime, xterm)`
  - 从选区读取文本并写入剪贴板
  - 复用`bumpCopiedNonce()`与`attachOptions?.onCopy?.()`

- `pasteTextFromClipboard(runtime, xterm)`
  - 读取系统剪贴板文本
  - 调用`xterm.paste(text)`

#### 按键处理顺序

`attachCustomKeyEventHandler()`内建议保持以下顺序：

1. 应用级快捷键过滤

2. 平台文本粘贴快捷键判断

3. 平台文本复制快捷键判断

4. 现有 macOS `Meta` 特殊逻辑

5. 其他按键保持默认 xterm 行为

这样可以保证：

- 平台复制/粘贴优先级高于通用终端控制字符

- 不破坏现有应用级快捷键拦截逻辑

- 不改变未命中的普通终端输入路径

### 数据流

#### 文本粘贴

1. 用户在终端按下平台文本粘贴快捷键

2. 宿主层命中`isTerminalPasteShortcut`

3. 事件在宿主层被消费，不再继续交给 xterm 解释为控制字符

4. 从系统剪贴板读取文本

5. 通过`xterm.paste(text)`注入终端

6. xterm 根据当前模式处理普通粘贴或 bracketed paste

#### 文本复制

1. 用户在终端按下平台文本复制快捷键

2. 若存在选区，则宿主层命中复制分支

3. 从`xterm.getSelection()`读取选中文本

4. 写入系统剪贴板

5. 触发复制后的 UI 同步逻辑：

  - `bumpCopiedNonce()`

  - `attachOptions?.onCopy?.()`

6. 若不存在选区，则：

  - Windows 的`Ctrl+C`放行，交给终端产生中断

  - macOS / Linux 按各自平台规则放行

### 错误处理

#### 粘贴失败

- 如果读取剪贴板失败：

  - 事件仍然视为已被宿主消费

  - 不允许回退成原始`^V`或其他控制字符输入

  - 给一次轻量 warn 通知，说明文本粘贴失败

原因是：用户显式按下粘贴键，失败时最坏结果应当是“没粘进去”，而不是把不可见控制字符打进会话。

#### 复制失败

- 如果写入剪贴板失败：

  - 事件仍然保持复制语义

  - 不改动终端内容

  - 给一次轻量 warn 通知

### 测试策略

在`tests/terminal-runtime-store.test.ts`中补充宿主层按键行为测试。

#### 需要扩展的 mock

- xterm mock 需要新增：

  - `paste(text)`

  - `attachCustomKeyEventHandler(handler)`

  - 记录被注册的 handler，便于测试直接触发

- `navigator.clipboard` mock 需要支持：

  - `writeText()`

  - `readText()`

#### 核心用例

##### Windows

- `Ctrl+V`调用`xterm.paste(text)`，且事件不放行

- `Ctrl+Shift+V`调用`xterm.paste(text)`，且事件不放行

- `Shift+Insert`调用`xterm.paste(text)`，且事件不放行

- `Ctrl+C`在有选区时复制，不放行

- `Ctrl+C`在无选区时放行给终端

- `Ctrl+Insert`在有选区时复制，不放行

##### macOS

- `Cmd+V`调用`xterm.paste(text)`

- `Cmd+C`在有选区时复制

##### Linux

- `Ctrl+Shift+V`调用`xterm.paste(text)`

- `Ctrl+Shift+C`在有选区时复制

- `Ctrl+V`不被宿主层拦截

- `Ctrl+C`不被宿主层拦截

##### 异常路径

- 剪贴板读失败时，不调用`terminal.input()`回退控制字符路径

- 剪贴板写失败时，不破坏运行态，并触发错误提示

### 成功标准

本轮完成后，以下条件必须满足：

1. Windows 下`Ctrl+V`不再落成原始`^V`

2. Windows 下`Ctrl+Shift+V`和`Shift+Insert`也可执行文本粘贴

3. Windows 下`Ctrl+C`在有选区时优先复制，在无选区时保持终端中断语义

4. Windows 下`Ctrl+Insert`可执行复制

5. `Alt+V`图片粘贴行为保持不变

6. macOS / Linux 的常见终端复制/粘贴语义不被误伤

7. 不引入用户可配置入口

8. 不修改全局快捷键体系

### 风险与边界

- 风险一：不同浏览器/Electron 环境下剪贴板读权限行为可能有差异  
  应对：失败时明确提示，但不回退为控制字符输入

- 风险二：测试环境中的 xterm mock 与真实 xterm 行为可能存在偏差  
  应对：测试重点放在宿主层“是否拦截”和“是否调用正确 API”，而不是验证 xterm 内部粘贴实现

- 风险三：未来若继续增加终端平台快捷键，`terminalRuntimeStore.ts`可能再次膨胀  
  应对：本轮先通过小辅助函数控制复杂度；如果未来规则继续扩展，再独立抽成终端平台快捷键模块

### 后续计划

本 spec 完成并确认后，下一步应进入实现计划阶段：

- 基于该设计编写详细实现计划

- 再按计划修改`terminalRuntimeStore`与测试
