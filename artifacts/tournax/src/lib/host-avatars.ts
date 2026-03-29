export const HOST_AVATARS: Record<string, string[]> = {
  "Free Fire": [
    "/avatars/ff-avatar-1.jpeg",
    "/avatars/ff-avatar-2.jpeg",
    "/avatars/ff-avatar-3.jpeg",
    "/avatars/ff-avatar-4.jpeg",
    "/avatars/ff-avatar-5.jpeg",
  ],
  "BGMI": [
    "/avatars/bgmi-avatar-1.jpeg",
    "/avatars/bgmi-avatar-2.jpeg",
    "/avatars/bgmi-avatar-3.jpeg",
    "/avatars/bgmi-avatar-4.jpeg",
  ],
};

export function isImageAvatar(avatar: string | null | undefined): boolean {
  return !!avatar && (avatar.startsWith("/") || avatar.startsWith("http"));
}

export function resolveAvatarSrc(avatar: string): string {
  if (avatar.startsWith("/objects/")) return `/api/storage${avatar}`;
  return avatar;
}
