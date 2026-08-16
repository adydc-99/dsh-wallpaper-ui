# dsh-wallpaper

这是一个原生、独立的 Cordis bundle，为 DeepSeek Harness Web UI 提供可持久保存的图片、GIF 与视频壁纸。

## 环境要求

- Node.js `^22.19.0 || >=24.0.0`
- Web profile（客户端部分只在浏览器中运行）

| dsh-wallpaper | DeepSeek Harness |
|---|---|
| `0.1.x` | `0.1.0-rc.6` |

## 从当前项目安装

```sh
pnpm install
pnpm build
cd ..
dsh plugin --profile web add ./dsh-wallpaper
dsh --profile web --dump-config
dsh --profile web
```

请在项目目录的上一级执行 `dsh plugin`；本地包参数必须指向插件项目，而不是 profile 目录本身。

更新本地项目时，请拉取新版本后重新执行 `pnpm install` 和 `pnpm build`，再重启 DSH。若安装的是软件源发布版，可执行：

```sh
dsh plugin --profile web update dsh-wallpaper
```

启动后打开“设置 → 壁纸”。本地上传支持 JPG、PNG、WebP、GIF、MP4、WebM，单文件上限为 100 MiB。网络壁纸只接受 HTTP(S) URL，并由浏览器直接加载，Host 不会代为下载。

卸载命令：

```sh
dsh plugin --profile web remove dsh-wallpaper
```

卸载会移除路由、AI 工具、设置入口、主题覆盖、样式表和全局背景层。壁纸库仍保留在 `$DSH_HOME/plugins/dsh-wallpaper/v1`，只有用户手动删除该目录时才会清除。

如需保留壁纸库与显示参数，请备份 `$DSH_HOME/plugins/dsh-wallpaper/v1`。

## 手动与 AI 权限

| 操作 | 用户在设置页 | AI 工具 |
|---|:---:|:---:|
| 列出已有壁纸 | 可以 | 可以 |
| 启用已有壁纸 | 可以 | 可以 |
| 调整显示参数 | 可以 | 可以 |
| 上传文件 | 可以 | 不可以 |
| 新增 URL | 可以 | 不可以 |
| 删除壁纸 | 可以 | 不可以 |

## 安全边界

- 上传文件先流式写入插件私有临时目录；扩展名、声明 MIME 和文件头检测结果三者一致时才会入库。
- 所有写操作必须来自回环连接，并携带与 Host 一致的 `Origin`。
- AI 仅能调用 `wallpaper_list` 和 `wallpaper_apply`；不能上传、添加 URL 或删除壁纸。
- URL 仅允许 HTTP(S)，不得包含用户名或密码，且 Host 不下载其内容。
- 视频壁纸加载失败时会恢复默认显示参数，不影响聊天功能。

远程壁纸站点会看到普通浏览器请求信息，包括用户的网络地址，以及由浏览器 Referrer Policy 决定的请求头。当 DSH 通过 HTTPS 提供时，浏览器可能阻止加载 `http://` 壁纸。

## 开发验证

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm pack --dry-run
```
