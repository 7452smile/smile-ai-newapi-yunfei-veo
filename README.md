# Smile AI Veo 视频任务插件

用于 NewAPI **任务插件 API v1** 的单文件 JavaScript 插件。它将 `/v1/videos` 请求接到云飞的视频接口，提供异步任务查询、视频地址和按秒计费用量。

**运行只需要 `plugin.js`；显示品牌图片还需在上传窗口选择 `icon.png`。不需要修改 NewAPI 核心代码、安装 Node.js 或重新构建镜像。** 首次导入后还需要绑定渠道并配置价格；本仓库不自动修改任何线上配置。

插件名称：**Smile AI Veo** · 插件标识：`smile-yunfei-veo` · 版本：`1.0.1`

## 从 1.0.0 升级

1. 在 **任务插件** 中打开原来的 **云飞 Veo · Smile AI**，选择“上传新版本”。不要删除旧插件或新建另一个插件标识。
2. 从下面的 `v1.0.1/plugin.js` 地址导入源码，或上传对应的 `plugin.js` 文件。
3. 在同一窗口的 **插件图标** 中选择本仓库的 `icon.png`，确认预览名称为 **Smile AI Veo**、版本为 `1.0.1`，再上传。
4. 打开插件详情的 **版本历史**，在 `1.0.1` 一行点击 **激活 / 回滚**，确认它变为激活版本。
5. 刷新后台和模型广场。已经绑定 `smile-yunfei-veo` 的渠道无需重新选择提供方；四个模型和原有定价配置继续使用。尚未绑定本插件的渠道仍须按后文设置。

此版本更新显示名称、描述、错误提示中的品牌文字和图标文件，不改请求、模型映射、异步查询或计费逻辑。内部标识保持不变，避免影响现有渠道和价格；仓库名、上游地址及内部标识仍可用于识别上游，因此这是显示改名，不是完整的供应商信息隐藏方案。

### 图标说明

`icon.png` 使用站点提供的[品牌图片](https://api.smile-ai-studio.com/festival/assets/brand.png)。NewAPI 禁止在 `meta.icon` 中写图片网址或 base64；图片必须通过上传窗口的独立图标栏提交。**仅从 URL 导入 `plugin.js` 不会自动导入图片。**

固定版本图标下载地址：

```text
https://raw.githubusercontent.com/7452smile/smile-ai-newapi-yunfei-veo/v1.0.1/icon.png
```

当前 Smile AI NewAPI 的插件管理支持独立图片，但模型广场的服务方页签只读取 `meta.icon`，尚未传递独立图片信息。因此后台插件管理可显示品牌图片，模型广场会显示 **Smile AI Veo** 和 **AI** 文字图标。要让模型广场也显示品牌图片，需要另外修改 NewAPI；只更新插件无法实现。插件使用 `text:AI` 作为未加载图片时的后备图标。

## 四个模型

| 客户端使用的模型名称 | 插件默认发送给云飞的名称 |
| --- | --- |
| `gemini-omni-1.1-flash` | `omni-flash` |
| `veo-3.1-fast-generate-preview` | `veo-3.1-fast` |
| `veo-3.1-lite-generate-preview` | `veo-3.1-lite` |
| `veo-3.1-generate-preview` | `veo-3.1-quality` |

Omni 的对外名称已按要求改为 `gemini-omni-1.1-flash`。客户端和渠道模型列表使用左列的四个名称；插件内部完成右列映射，因此渠道的“模型映射”可以留空。已有映射到右列短名称的配置也兼容。

右列来自接入时提供的云飞模型命名，只是转发标识，不能据此证明云飞内部使用的实际 Google 型号或版本。

云飞[公开视频文档](https://doc.yunfei.best/#veo-text)描述了 `/v1/videos`、`duration`、异步状态及 `url`；截至 2026-09-28，文档没有单独列出 Lite 和 Omni。Omni 使用同一接口并按秒计费由接入方确认。插件为四个型号提供相同适配，但没有进行真实付费生成，Lite / Omni 的上游可用性及全部参数能力仍须在接入后核验。

## 导入 NewAPI

1. 在管理员后台找到 **任务插件**，打开“上传任务插件”。
2. 选择“从 URL 导入”，粘贴下面的 **JS 源码链接**；也可以将 `plugin.js` 下载后直接上传文件。
3. 在 **插件图标** 中选择 `icon.png`。预览应显示名称 **Smile AI Veo**、标识 `smile-yunfei-veo`、版本 `1.0.1` 和上述四个模型，再保存。
4. 确保任务插件总开关及此插件处于启用状态。若已有旧版本，在 **版本历史** 中激活 `1.0.1`。

固定版本导入地址（建议使用）：

```text
https://raw.githubusercontent.com/7452smile/smile-ai-newapi-yunfei-veo/v1.0.1/plugin.js
```

主分支源码地址（后续可能更新）：

```text
https://raw.githubusercontent.com/7452smile/smile-ai-newapi-yunfei-veo/main/plugin.js
```

不要把仓库首页或 GitHub ZIP 下载地址当作插件源码导入。如果 URL 读取失败，改为上传本仓库的 `plugin.js` 文件即可。`CHECKSUMS.sha256` 可用于核对源码完整性。

本插件针对现有 Task Plugin API v1 开发，已在 Smile AI 本地 RC.39 源码基线上通过真实运行器兼容性测试；不保证没有任务插件功能的旧版 NewAPI 可用。

## 渠道设置

新建或配置一个专门的云飞视频渠道：

| 项目 | 设置 |
| --- | --- |
| 渠道类型 | **Task Plugin / 任务插件**，类型编号 `61` |
| 绑定插件 | **Smile AI Veo** / `smile-yunfei-veo` |
| Base URL | `https://img.yunfei.best`，也兼容末尾 `/v1` |
| 密钥 | 在渠道后台填写自己的云飞 API Key |
| 模型 | 上表左列的四个名称 |
| 模型映射 | 可留空；插件已内置映射 |
| 分组、优先级、权重 | 按站点自己的路由策略设置 |

这四个模型的云飞请求必须选中上述渠道。如果原有 **Gemini** 渠道仍为相同用户组提供这些模型，可能继续被选中并走 Google 原生接口。按自己的路由策略从原渠道移除对应模型，或为云飞视频单独设置分组。**只新增插件而不调整渠道路由，不能消除原来的 `contents is required` 错误。**

请求端仍然使用 `POST /v1/videos`。不需要使用 Gemini 的 `:predictLongRunning`，不需要开启请求体透传。请勿配置会改写 `duration`、`seconds`、数量或模型的额外请求覆盖规则，以免破坏计费与实际生成的一致性。

## 按秒定价

插件输出的计费用量字段是 `seconds`，单位是 **秒**，没有内置任何售价。

1. 进入 **模型定价**，分别打开四个对外模型名。
2. Fast / Standard 等有多个服务方的模型，选择 **Smile AI Veo** 页签，开启“为此服务方单独设置”。
3. 配置自己的每秒售价并保存。Omni / Lite 若只有本插件且没有服务方专属价格，不显示服务方页签，直接在默认模型价格中设置视频生成单价即可。
4. 检查 4、6、8 秒的价格预览是否符合预期，同时核对分组倍率。

如果使用可视化价格输入框，按界面标明的币种填写；如果直接编辑表达式，表达式中的金额始终是 **USD**。例如下面仅为演示：

```text
tier("base", u("seconds") * 0.1)
```

它表示 **0.10 美元/秒**，不是 0.10 元/秒。分组倍率为 1 时，4、6、8 秒分别是 0.40、0.60、0.80 美元。实际售价请自行确定，不能直接把供应商成本当作零售价。

此前在 **Google Veo** 页签设置的插件专属价格（例如 `google::veo-3.1-fast-generate-preview`）不会自动转移到这个插件。本插件对应 `smile-yunfei-veo::<模型名称>`。如果不设置专属价格，请明确检查继承的默认模型表达式是否正确，不能假定旧价格自动生效。

任务提交时报告请求的秒数；成功时，若上游返回有效的 `duration` / `seconds`，会报告该秒数用于宿主结算。上游不返回时长时，保留提交时的用量估计。损坏或不一致的完成用量会被拒绝，当前宿主回退到预留用量。预扣、最终结算、失败退款和幂等由 NewAPI 自己处理；本插件不直接操作钱包或数据库，也没有对真实账户退款做过测试。

## 调用方式

以下示例只展示格式；实际执行提交会消耗上游额度。`YOUR_NEWAPI_TOKEN` 应替换为自己的 NewAPI 用户令牌，不是云飞渠道密钥。

```sh
curl 'https://YOUR_NEWAPI_HOST/v1/videos' \
  -H 'Authorization: Bearer YOUR_NEWAPI_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "prompt": "一只纸船缓缓漂过雨后的水面，电影感镜头",
    "duration": 4,
    "aspect_ratio": "16:9",
    "generate_audio": true
  }'
```

保存提交响应的公开任务 `id`，查询该任务：

```sh
curl 'https://YOUR_NEWAPI_HOST/v1/videos/TASK_ID' \
  -H 'Authorization: Bearer YOUR_NEWAPI_TOKEN'
```

状态依次可能为 `queued`、`in_progress`、`completed`，失败为 `failed`。完成后响应保留 `url` 字段，可供现有“读取 `url` 下载视频”的 Python 脚本使用。查询间隔可设为 5～10 秒。

```json
{
  "id": "task_public_example",
  "status": "completed",
  "url": "https://cdn.example/video.mp4"
}
```

上例省略了宿主添加的 `model`、进度、时间等字段。插件返回 NewAPI 的公开任务 ID，不直接暴露上游任务快照。视频地址可能过期，应及时保存视频。通过 NewAPI 下载任务产物时，插件使用无凭据的 GET / HEAD 请求，不把云飞 API Key 发送给视频 CDN。

## 请求参数与范围

当前版本接受 JSON 请求，输出限定为 720p；四个模型共用以下参数规则。

| 参数 | 说明 |
| --- | --- |
| `model` | 必填，四个对外模型名称之一 |
| `prompt` | 必填，非空字符串 |
| `duration` | 必填，4 / 6 / 8；兼容 `seconds`，支持数字或数字字符串 |
| `aspect_ratio` | `16:9` 或 `9:16`，默认 `16:9`；兼容 `aspectRatio` |
| `generate_audio` | 布尔值，默认 `true`；兼容 `generateAudio`，显式 `false` 会保留 |
| `negative_prompt` | 可选字符串；兼容 `negativePrompt` |
| `image_url` | 可选首帧图片字符串；兼容 `image` / `input_reference` |
| `image_urls` | 可选 1～2 张图片数组，2 张时依次为首帧、尾帧；兼容 `images` |
| `size` | 可选 `1280x720` / `720x1280`，转换为相同比例 |
| `resolution` | 可选，仅接受 `720p` |

图片支持公网 HTTP(S) 地址、图片 data URL 或裸 base64。不接受图片对象格式或 multipart 文件上传；本地图片需要先编码为 data URL。`image_url` 和 `image_urls` 不可同时传入。

同一参数的多个别名必须一致，例如 `duration: 4` 与 `seconds: 8` 会在提交前拒绝。未知字段也会被拒绝，包括 `n`、`sampleCount`、`metadata`、`parameters` 等，避免隐藏数量影响生成和计费。

暂不支持 `veo-3.1-generate-preview-ref` 多参考图型号、视频编辑/延长、批量生成、1080p/4K、Responses API、Google Gemini/Vertex 原生调用格式，也未声明 NewAPI 上游级联能力。

## 本地验证

安装插件无需任何开发依赖。维护代码时，需要 Node.js 20 或更新版本：

```sh
npm run check
npm test
```

这两项检查不使用 API Key，不调用云飞，包含四模型的本地 HTTP 模拟“提交 → 查询 → 完成 → 下载”流程。

若已有匹配版本的 NewAPI 源码和 Go 环境，可运行实际宿主兼容性检查：

```sh
npm run test:host -- /path/to/new-api
```

测试在临时目录创建独立 Go 模块，通过本地 `replace` 引用 NewAPI 源码，完成后清理临时目录。它不会修改 NewAPI 源码、启动网关或连接数据库，也不会请求云飞；Go 首次执行可能需要下载依赖。测试涵盖 Sobek 插件导入、与 Google 插件共存、实际适配器请求构造、秒数校验、USD 表达式和分组倍率、任务解析、即时完成、公开结果与无凭据下载描述。

首版验证基线：本地 Smile AI RC.39 源码提交 `1af7d956238ac1cb100f5fa3c747980593245397`。16 项 Node 测试及 5 组宿主测试通过，宿主请求/计费部分含 24 个模型、映射和时长组合。**这不等同于真实云飞生成验收或线上钱包/退款验收。**

`1.0.1` 于 2026-09-28 再次通过语法检查、全部 16 项 Node 测试和 5 组宿主测试；本次宿主源码基线为 `5ccac08d1f5abd74eb867002ee3a31b0382f9e2d`。品牌 PNG 为 348,408 字节，编码后的上传字段为 464,566 字节，符合宿主 512 KiB 限制。

本次开发没有访问或更改生产配置，没有部署、重启或发起真实付费视频生成。

## 许可证与归属

本插件采用 [GNU AGPL v3](LICENSE)，版权归 Smile AI。本项目是面向 [QuantumNous / new-api](https://github.com/QuantumNous/new-api) Task Plugin API 的独立社区适配，不是云飞或 Google 官方插件。宿主兼容性测试使用 NewAPI 的公开接口；本仓库不包含 NewAPI 源码或任何渠道密钥。
