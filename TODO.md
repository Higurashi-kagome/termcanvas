# TODO

## Windows 终端粘贴快捷键与 CMD / PowerShell 保持一致

- 状态：待处理

- 记录时间：2026-05-18

- 问题现象：
  在应用内的 CodeX 终端中，`Ctrl+V` 目前会落成原始 `^V` / 触发图片相关行为，而 `Ctrl+Shift+V` 才能稳定粘贴文本。

- 期望行为：
  在 Windows 上尽可能与 `cmd.exe` / PowerShell 一致，默认让 `Ctrl+V` 执行文本粘贴，不再把它直接送进 PTY 变成原始控制字符。

- 已知背景：
  xterm 默认更接近通用终端键盘语义，`Ctrl+字母` 可能被解释为控制字符；如果宿主层没有显式拦截并转为粘贴，`Ctrl+V` 就会变成原始 `^V`。

- 后续处理方向：
  在终端宿主层而不是 CLI 层处理 Windows 特化快捷键：

  - `Ctrl+V` 作为文本粘贴，优先走 xterm / bracketed paste

  - `Ctrl+Shift+V` 作为兼容备用文本粘贴

  - `Alt+V` 如需保留，可单独作为图片粘贴入口，但不应覆盖默认文本粘贴

- 备注：
  当前只记录问题，不在本次处理范围内修改实现。
