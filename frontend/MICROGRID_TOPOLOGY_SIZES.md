# 设备图片尺寸调整说明

## 调整位置

设备图片大小在 **`frontend/src/components/pages/MicrogridTopology.css`** 中定义。

> **若修改后尺寸无变化**：请确认 (1) 修改的是对应模式（wizard / standard）的规则；(2) 清除浏览器缓存或硬刷新（Ctrl+Shift+R）；(3) 开发模式下保存后热更新是否生效。

### Wizard 模式（已知负载/DIY 向导内）

```css
/* 第 46-49 行 */
.topology-device--wizard.topology-device--pv .topology-device__img-wrap { width: 200px; height: 170px; }
.topology-device--wizard.topology-device--load .topology-device__img-wrap { width: 185px; height: 155px; }
.topology-device--wizard.topology-device--ess .topology-device__img-wrap { width: 170px; height: 145px; }
.topology-device--wizard.topology-device--diesel .topology-device__img-wrap { width: 155px; height: 130px; }
```

### Standard 模式（标准化产品页、产品示意图）

```css
/* 第 52-55 行 */
.topology-device--standard.topology-device--pv .topology-device__img-wrap { width: 400px; }
.topology-device--standard.topology-device--load .topology-device__img-wrap { width: 240px; height: 200px; }
.topology-device--standard.topology-device--ess .topology-device__img-wrap { width: 220px; height: 185px; }
.topology-device--standard.topology-device--diesel .topology-device__img-wrap { width: 200px; height: 170px; }
```

### 响应式（小屏幕）

```css
/* 第 183-191 行 @media (max-width: 900px) */
```

修改上述 `width` 和 `height` 即可调整各设备图片大小。
