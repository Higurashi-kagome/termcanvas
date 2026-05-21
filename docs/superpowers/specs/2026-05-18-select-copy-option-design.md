### 概述

当前 TermCanvas 终端在用户通过鼠标选中文本后，会在选区完成时自动把选中文本写入系统剪贴板。这个行为已经存在，但缺少用户可见、可持久化的配置入口，导致不喜欢 copy-on-select 的用户无法关闭它。

本次设计的目标是把“终端选中即复制”提升为正式偏好项：

- 默认保持开启，避免改变现有用户行为

- 允许用户在设置面板中关闭

- 关闭后仅影响“鼠标选区后自动复制”这一路径

- 不影响快捷键复制、显式复制按钮或其他手动复制路径

### 目标与非目标

目标：

- 新增全局偏好`terminalSelectionAutoCopyEnabled`

- 在设置面板提供对应开关

- 终端运行时根据该偏好决定是否在选区结束时自动写入剪贴板

- 为偏好持久化与运行时行为补充测试

非目标：

- 不修改`Ctrl/Cmd+C`、`Ctrl+Insert`等手动复制逻辑

- 不引入按平台差异化默认值

- 不做每个终端实例单独配置

- 不扩展成完整“终端输入策略中心”

### 现状

自动复制逻辑已经独立存在于终端运行时层：

- `src/terminal/selectionAutoCopy.ts`负责维护选区自动复制状态机，跟踪 pointer gesture、selection revision 和已复制 revision

- `src/terminal/terminalRuntimeStore.ts`中的`wireSelectionBindings()`负责接线

现有事件链为：

1. `mousedown`时标记开始一次 pointer gesture

2. `xterm.onSelectionChange()`时更新 selection revision

3. `window mouseup`时调用`maybeAutoCopySelection()`

4. 如果状态机判断满足条件，则直接调用`navigator.clipboard.writeText(text)`

这说明功能边界已经较清晰，当前缺的不是底层机制，而是一个正式偏好项和 UI 入口。

### 方案对比

方案 A：新增全局布尔偏好并挂到设置页输入分组

- 优点：改动面最小，和现有`preferencesStore`模型一致，持久化与 UI 接入路径明确

- 优点：只需在运行时自动复制入口处加一道偏好判断，不影响其他复制路径

- 缺点：只能全局控制，不能对单个终端实例差异化配置

方案 B：按平台区分配置可见性或默认值

- 优点：可以向传统平台习惯靠拢，例如只在部分平台强调此行为

- 缺点：当前仓库已跨平台支持该能力，再引入平台差异会增加产品语义与测试成本

- 缺点：与本次“默认开启、允许关闭”的明确需求不一致

方案 C：扩展为统一“终端输入行为”配置对象

- 优点：如果后续确实新增更多输入策略，这种结构有更强扩展性

- 缺点：明显超出本次需求，属于过度设计

推荐采用方案 A。

### 设计

#### 配置模型

在`src/stores/preferencesStore.ts`中新增布尔偏好：

- 字段：`terminalSelectionAutoCopyEnabled`

- 默认值：`true`

- setter：`setTerminalSelectionAutoCopyEnabled(value: boolean)`

该字段需要接入现有偏好存储完整链路：

- `PreferencesStore`接口

- `SavedPrefs`接口

- `loadPreferences()`

- `getSaveState()`

- `usePreferencesStore`初始值和 setter

这样可以保证：

- 新用户默认继承现有行为

- 老用户升级后若本地存储缺少该字段，也会回退到`true`

- 用户切换设置后，下次启动仍保持选择

#### 设置面板

在`src/components/SettingsModal.tsx`中新增设置项，文案语义为“终端选中即复制”或等效描述，说明文案强调它只控制鼠标选区后的自动复制。

推荐放置位置：

- `Features`页

- `Input`分组

原因：

- 这是终端输入/选择行为，不是外观设置

- 与现有`trackpadSwipeFocusEnabled`同属用户输入交互偏好

当前`Input`分组只在 macOS 下显示，因为其中仅包含 trackpad swipe 相关设置。本次需要调整分组显示条件，避免新开关在 Windows/Linux 无入口。

推荐规则：

- 只要当前平台有至少一个输入类设置可展示，就渲染`Input`分组

具体表现为：

- macOS：显示 trackpad swipe 和 terminal selection auto copy 两项

- Windows/Linux：至少显示 terminal selection auto copy

#### 运行时数据流

自动复制逻辑仍保留在`wireSelectionBindings()`内，不拆到新的系统层。

新的事件流如下：

1. 用户在 xterm 区域按下鼠标，记录 pointer gesture

2. 用户拖拽形成选区，`onSelectionChange()`更新状态机 revision

3. 用户释放鼠标，`maybeAutoCopySelection()`读取当前选中文本和偏好

4. 若`terminalSelectionAutoCopyEnabled === false`，直接返回，不写剪贴板，不 bump copied nonce

5. 若开关开启，则继续沿用现有状态机判断；满足条件时执行自动复制

这里有一个刻意保留的设计点：

- 即使开关关闭，选区状态机仍继续更新，不需要为关闭态拆掉事件监听

理由是：

- 逻辑更简单，避免为一个轻量开关引入额外绑定/解绑复杂度

- 开关重新开启后，无需重新初始化整套选区监听模型

#### 运行时边界

本次只改自动复制入口，不改变下列行为：

- `copyTerminalSelection()`显式复制 helper

- 键盘复制快捷键路径

- 其他组件中调用`navigator.clipboard.writeText()`的显式复制行为

这样可以把行为边界稳定限定为“鼠标选区完成后是否自动落剪贴板”。

### 错误处理

自动复制现有逻辑对`navigator.clipboard.writeText()`失败采用静默兜底：

- `catch(() => {})`

- 不抛出错误给用户

本次保持该策略不变。原因是：

- 本次是可选增强行为，不应因为自动复制失败打断终端主流程

- 关闭开关后会更少触发该路径，不需要新增额外错误分支

手动复制路径的错误处理也保持现状，不纳入本次范围。

### 测试策略

#### 偏好存储测试

在`tests/preferences-store.test.ts`补充：

- 默认情况下`terminalSelectionAutoCopyEnabled === true`

- 当本地存储写入`false`时，加载后能正确恢复为`false`

- 调用`setTerminalSelectionAutoCopyEnabled(false)`后，store 状态与持久化数据都正确更新

#### 运行时自动复制测试

在`tests/terminal-runtime-store.test.ts`补充运行时层测试，覆盖：

- 开关开启时，自动复制路径会写入剪贴板

- 开关关闭时，自动复制路径不会写入剪贴板

- 开关关闭时，手动复制 helper 仍可正常复制选区内容

若测试结构不方便直接驱动 DOM 事件，可以把自动复制判定提炼为小的可测函数，但前提是不要为了测试重构出与现有运行时结构脱节的新抽象。

#### 状态机测试

`tests/shortcut-behavior.test.ts`中现有`selectionAutoCopy`状态机测试继续保留。

本次不建议把偏好开关塞进状态机模块测试，因为：

- `selectionAutoCopy.ts`只负责“何时满足自动复制条件”

- “是否允许自动复制”属于运行时策略，不属于状态机职责

### 风险与规避

风险 1：设置入口放在仅 macOS 可见分组，导致非 macOS 用户无法关闭

规避：

- 调整`Input`分组的显示条件，让该开关在所有支持终端选区的平台可见

风险 2：误伤手动复制路径

规避：

- 只在`maybeAutoCopySelection()`分支读取新偏好

- 不改`copyTerminalSelection()`和键盘复制逻辑

风险 3：老用户升级后因存储缺失导致行为意外变化

规避：

- 缺省值明确设为`true`

- `loadPreferences()`对缺失字段回退到`true`

### 实施范围

预计变更文件：

- `src/stores/preferencesStore.ts`

- `src/components/SettingsModal.tsx`

- 终端相关 i18n 文案文件

- `src/terminal/terminalRuntimeStore.ts`

- `tests/preferences-store.test.ts`

- `tests/terminal-runtime-store.test.ts`

必要时可增加极少量测试辅助代码，但不引入新的持久化层或新的配置模块。

### 验收标准

满足以下条件即可认为完成：

1. 默认安装或无历史配置时，终端仍保持“选中即复制”

2. 用户可在设置中关闭该行为

3. 关闭后，鼠标选区结束不会写入系统剪贴板

4. 关闭后，快捷键复制和其他手动复制行为保持正常

5. 重启应用后，开关状态可正确恢复

6. 相关测试覆盖默认值、持久化和运行时行为
