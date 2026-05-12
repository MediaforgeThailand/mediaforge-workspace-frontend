import academyAvatar from "@/assets/academy-header-academy.png";
import cinematicAvatar from "@/assets/academy-header-cinematic.png";
import editingAvatar from "@/assets/academy-header-editing.png";
import soundAvatar from "@/assets/academy-header-voice-sound.png";
import threeDAvatar from "@/assets/academy-header-3d.png";
import spaceCatAvatar from "@/assets/pro-trend-space-cat.jpg";
import astronautCatAvatar from "@/assets/showcase-cat-astronaut.jpg";
import chibiAvatar from "@/assets/trending-chibi.jpg";

const PROJECT_AVATARS = [
  academyAvatar,
  spaceCatAvatar,
  astronautCatAvatar,
  chibiAvatar,
  threeDAvatar,
  cinematicAvatar,
  editingAvatar,
  soundAvatar,
];

type ProjectAvatarSeed = {
  id?: string | null;
  name?: string | null;
};

function hashProjectSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getProjectAvatar(project: ProjectAvatarSeed | null | undefined): string {
  const seed = `${project?.id ?? ""}:${project?.name ?? ""}`.trim() || "default-project";
  return PROJECT_AVATARS[hashProjectSeed(seed) % PROJECT_AVATARS.length];
}
