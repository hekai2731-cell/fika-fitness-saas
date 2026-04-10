# 宝塔 Nginx 配置：Survey SPA 路由

目标：让 `https://saas.fikafitness.com/survey?code=FIKA-WF001` 正常返回前端 `index.html`，避免 404。

## 1) 打开站点配置

1. 进入宝塔面板 -> `网站`
2. 找到 `saas.fikafitness.com` 对应站点
3. 点击 `设置` -> `配置文件`

## 2) 核心配置（重点是 try_files）

在站点 `server { ... }` 中，确保有如下配置（没有就补）：

```nginx
root /www/wwwroot/fika-frontend/dist;
index index.html;

location / {
    try_files $uri $uri/ /index.html;
}

location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 3) 常见冲突项检查

如果配置里有这些内容，需要确认不会覆盖上面的 SPA 路由：

- `location = /404.html` 或静态错误页强制跳转
- 过于宽泛的 `location ~* \.(js|css|...)$` 规则
- 多个 `location /`（只保留一个主入口）

## 4) 保存并重载 Nginx

1. 点击保存
2. 宝塔会提示“是否重载”，选择重载
3. 如果重载失败，先看报错行号，修复后再重载

## 5) 验证

在浏览器访问：

- `https://saas.fikafitness.com/`
- `https://saas.fikafitness.com/survey?code=FIKA-WF001`

预期：

- 两者都返回前端页面（不是 Nginx 404）
- Survey 页面能读取 query 参数 `code`

## 6) API 连通性验证（可选）

可用浏览器或 curl 检查：

```bash
curl -i "https://saas.fikafitness.com/api/clients/by-road-code/FIKA-WF001"
```

预期：

- 存在该路书码时返回 200 + 客户 JSON
- 不存在时返回 404（前端会显示二维码失效提示）
