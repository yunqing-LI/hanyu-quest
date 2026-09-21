// ─────────────────────────────────────────────────────────────────────────────
// 开发者邮箱集中配置文件（唯一需要修改的地方）
// 上线前把占位邮箱替换为老师的真实邮箱即可，全站开发者入口权限自动生效。
// ─────────────────────────────────────────────────────────────────────────────
export const DEVELOPER_EMAILS: string[] = ["liyunqing1220@163.com"];

export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEVELOPER_EMAILS.includes(email.trim().toLowerCase());
}
