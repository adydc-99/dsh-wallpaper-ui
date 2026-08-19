# dsh-wallpaper-ui

[![npm version](https://img.shields.io/npm/v/dsh-wallpaper-ui)](https://www.npmjs.com/package/dsh-wallpaper-ui)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

这是一个原生、独立的 Cordis 插件，为 **DeepSeek Harness** Web UI 提供可持久保存的**图片、GIF 与视频壁纸**。

开箱即用：上传一张图片或视频，选中即可显示——默认面板透明度已调好，无需手动折腾滑块。

## 功能特性

- 图片 / GIF / 视频壁纸（JPG、PNG、WebP、GIF、MP4、WebM）
- 五种显示模式：铺满（cover）、包含（contain）、拉伸（stretch）、居中（center）、平铺（tile）
- 支持本地上传 **和** HTTP(S) 网络 URL
- 显示控制：壁纸透明度、亮度、模糊、遮罩颜色、面板透明度
- 兼容 DeepSeek Harness `0.1.0-rc.6` 与 `0.1.0-rc.7`

## 安装

从 npm 软件源安装（推荐）：

```sh
dsh plugin add dsh-wallpaper-ui
```

从 GitHub 安装：

```sh
dsh plugin add https://github.com/adydc-99/dsh-wallpaper.git
```

从当前项目安装（开发调试）：

```sh
pnpm install
pnpm build
cd ..
dsh plugin --profile web add ./dsh-wallpaper
dsh --profile web
```

更新已安装的软件源版本：

```sh
dsh plugin --profile web update dsh-wallpaper-ui
```

卸载：

```sh
dsh plugin --profile web remove dsh-wallpaper-ui
```

## 截图

<!-- TODO: 添加壁纸效果与设置面板的截图 -->

## 使用说明

1. 打开 **设置 → 壁纸**。
2. 上传一张图片 / GIF / 视频，或添加 HTTP(S) 网络 URL。
3. 选中壁纸条目——立即生效。
4. 按需调整显示参数（壁纸透明度、面板透明度、显示模式等）。

本地上传支持 JPG、PNG、WebP、GIF、MP4、WebM，单文件上限 100 MiB。

## 兼容性

| 插件 | DeepSeek Harness |
|---|---|
| `0.1.x` | `0.1.0-rc.6` / `0.1.0-rc.7` |

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
- 插件的所有路由都只接受回环连接上的字面回环 Host；写操作还必须携带与 Host 一致的同源 `Origin`。启用本插件时，请通过 `localhost`、`127.0.0.1` 或 `[::1]` 访问 DSH。
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
