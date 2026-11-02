// 订阅全局课堂会话快照。切页重挂载时用当前快照初始化，不会先闪一下「待开始」。

import { useEffect, useState } from "react";
import { classroomSession } from "../lib/classroom-session";
import type { ClassroomSnapshot } from "../lib/classroom";

export function useClassroomSnapshot(): ClassroomSnapshot {
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot>(() => classroomSession.getSnapshot());
  useEffect(
    () =>
      classroomSession.subscribe({
        onSnapshot: setSnapshot,
      }),
    [],
  );
  return snapshot;
}

/** 课堂是否仍在进行（含连接中/暂停/收尾）。 */
export function isClassroomActive(snapshot: ClassroomSnapshot): boolean {
  return (
    snapshot.phase === "connecting" ||
    snapshot.phase === "listening" ||
    snapshot.phase === "paused" ||
    snapshot.phase === "stopping"
  );
}
