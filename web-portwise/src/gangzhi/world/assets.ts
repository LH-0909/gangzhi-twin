// 静态资源统一通过 Vite 的 base 前缀拼接，保证部署在子路径（如 GitHub Pages
// 的 /gangzhi-twin/）时，模型、贴图和 HDR 仍然能被正确解析。
export const harbor = (file: string) => `${import.meta.env.BASE_URL}assets/harbor/${file}`;
