// 全局课堂会话单例。
//
// 控制器必须活在 React 组件树之外：切到「学习」「设置」等页面时 ClassroomPage 会卸载，
// 若控制器跟着页面走，麦克风、WebSocket 与快照一起丢失——用户看到的就是「切页即结束」。
// 这里用模块级单例持有同一条课堂会话，页面与外壳只订阅快照。

import { ClassroomController } from "./classroom";

export const classroomSession = new ClassroomController();
