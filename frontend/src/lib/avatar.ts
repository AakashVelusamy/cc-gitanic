export const DEFAULT_AVATAR_URL =
  'https://static.vecteezy.com/system/resources/thumbnails/032/176/191/small/business-avatar-profile-black-icon-man-of-user-symbol-in-trendy-flat-style-isolated-on-male-profile-people-diverse-face-for-social-network-or-web-vector.jpg';

export function resolveAvatarUrl(avatarUrl: string | null | undefined): string {
  const value = avatarUrl?.trim();
  return value || DEFAULT_AVATAR_URL;
}
