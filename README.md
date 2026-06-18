# pi-fake-secret 🎭

**Secret NAT——像 NAT 转换网络地址一样，Harness 替模型换密钥。**

用户正常看到和使用真实密钥；模型只能看到假密钥，执行时 Harness 换成真的。

```
                 ┌────────────────────────────┐
                 │         Harness             │
                 │  ┌──────────────────────┐  │
用户/文件 ──fake──►│  │        model         │  │
                 │  └──────────────────────┘  │
用户/文件 ◄─restore─│                             │
                 └────────────────────────────┘
```

## 为什么

工作区里有 `.env`、配置文件、私钥。问 AI 问题时，这些密钥可能原样发给模型。

`pi-fake-secret` 在边界拦截：进入模型上下文前换成假密钥，模型调用工具前换回真实密钥，模型回复展示给用户前也换回真实密钥。

核心目标是对用户透明：装了插件后，用户仍然看到原本的文件内容和回答；变化只发生在模型视角里。

## 安装

```bash
pi install /path/to/pi-fake-secret
```


## 使用

自动运行，无需配置。

| 命令 | 说明 |
|---------|------|
| `/secret-mask status` | 映射统计 |
| `/secret-mask list` | 列出所有映射 |

## 覆盖通道

| 钩子 | 方向 | 变换 |
|------|------|------|
| `input` | 用户 → model | 真→假 🎭 |
| `tool_call(bash)` | model → 执行 | 假→真 |
| `tool_call(write)` | model → 文件 | 假→真 |
| `tool_call(edit)` | model → 编辑 | 假→真 |
| `tool_result` | 结果 → model | 真→假 🎭 |
| `context` | 历史 → model | 真→假（静默） |
| `message_update` / `message_end` | model → 用户 | 假→真 |

## 内置格式

OpenAI、Anthropic、GitHub PAT、AWS、Stripe、Slack、JWT、PEM 私钥、Google API、GitLab、SendGrid 等常见密钥格式。

## License

MIT
